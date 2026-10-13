import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { parseAge } from "./age.js";
import { parseAvatar } from "./avatars.js";
import { env } from "./env.js";
import { validateNickname } from "./identity.js";
import { log } from "./log.js";
import { claimMemberName, isMemberName, releaseMemberName } from "./members.js";
import {
  getModeratorNames,
  isReservedNickname,
  normalizeName,
} from "./names.js";
import {
  authorizeUrl,
  enabledProviders,
  isProviderId,
  newVerifier,
  profileFromCode,
  type ProviderId,
} from "./oauth.js";
import { saveState, takeState } from "./oauthState.js";
import {
  createUser,
  deleteUser,
  fetchUser,
  findUserByIdentity,
  isTaken,
  updateUser,
  type UserRecord,
} from "./payloadClient.js";
import { signTicket, verifyTicket } from "./tickets.js";
import { signToken, verifyToken } from "./tokens.js";

// How long an account stays signed in on a browser; /me hands out a fresh token each time the page opens, so somebody who
// keeps coming back stays in.
export const MEMBER_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
// How long a person has to choose a nickname after the provider has vouched for them.
const TICKET_TTL_MS = 15 * 60_000;
const MAX_RETURN_PATH_LENGTH = 200;

const registerBodySchema = z.object({
  ticket: z.string().min(1).max(2000),
  nickname: z.unknown(),
  avatar: z.unknown().optional(),
  age: z.unknown().optional(),
});

// Where the browser is sent back to: a path of this site and nothing else, so a crafted link cannot send people to
// another address after they have signed in.
export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_RETURN_PATH_LENGTH ||
    !/^\/(?!\/)[^\\]*$/.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32) ||
    value.startsWith("/auth/")
  ) {
    return "/";
  }

  return value;
}

export function profileOf(user: UserRecord) {
  return {
    nickname: user.nickname,
    avatar: user.avatar,
    ...(user.age === undefined ? {} : { age: user.age }),
  };
}

// The nicknames nobody may take: a moderator's, one that claims to be staff, and one an account has.
async function nicknameRefusal(
  raw: unknown,
  exceptUserId?: number,
): Promise<"invalid_nickname" | "reserved_nickname" | undefined> {
  const nickname = validateNickname(raw);

  if (!nickname) return "invalid_nickname";

  if (
    isReservedNickname(nickname, await getModeratorNames()) ||
    (await isMemberName(nickname, exceptUserId))
  ) {
    return "reserved_nickname";
  }

  return undefined;
}

export function createAccountsRouter(options: {
  authTokenSecret: string;
  rateLimit?: { max: number; windowMs: number };
  // For the list of providers, which every page asks for: the same generous limit as the list of rooms.
  listRateLimit?: { max: number; windowMs: number };
  // Called when an account has been deleted, so what is still connected as it can be cut off.
  onAccountRemoved?: (userId: number) => unknown;
}): express.Router {
  const secret = options.authTokenSecret;
  const router = express.Router();
  const limitOf = (limit: { max: number; windowMs: number }) =>
    rateLimit({
      limit: limit.max,
      windowMs: limit.windowMs,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: "rate_limited" });
      },
    });
  const limiter = limitOf(options.rateLimit ?? { max: 30, windowMs: 60_000 });
  const listLimiter = limitOf(
    options.listRateLimit ?? { max: 60, windowMs: 60_000 },
  );

  const tokenFor = (user: UserRecord) =>
    signToken(
      { sub: user.id, name: user.nickname, role: "member" },
      { secret, ttlMs: MEMBER_TOKEN_TTL_MS },
    );

  // The account behind the bearer token, or the answer to send instead.
  async function memberOf(
    req: express.Request,
    res: express.Response,
  ): Promise<UserRecord | undefined> {
    const header = req.get("authorization") ?? "";
    const claims = header.startsWith("Bearer ")
      ? verifyToken(header.slice(7), { secret })
      : undefined;

    if (!secret || claims?.role !== "member") {
      res.status(401).json({ error: "invalid_token" });
      return undefined;
    }

    try {
      const user = await fetchUser(claims.sub);

      if (!user) res.status(401).json({ error: "invalid_token" });
      return user;
    } catch (error) {
      log.error("Failed to read the account", error);
      res.status(503).json({ error: "unavailable" });
      return undefined;
    }
  }

  router.get("/auth/providers", listLimiter, (_req, res) => {
    res.json({ providers: enabledProviders(secret) });
  });

  router.get("/auth/:provider/start", limiter, async (req, res) => {
    const provider = req.params.provider;

    if (
      !isProviderId(provider) ||
      !enabledProviders(secret).includes(provider)
    ) {
      return res.status(404).json({ error: "unknown_provider" });
    }

    try {
      const verifier = newVerifier();
      const state = await saveState({
        provider,
        verifier,
        returnPath: safeReturnPath(req.query.return),
      });

      res.redirect(authorizeUrl(provider, { state, verifier }));
    } catch (error) {
      log.error("Failed to start a sign-in", error);
      res.status(503).json({ error: "unavailable" });
    }
  });

  // Where the provider sends the browser back to. Whatever happens, the browser ends up on the web client, with the
  // outcome in the part of the address after `#`: that part is not sent to any server and not kept in their logs.
  router.get("/auth/:provider/callback", limiter, async (req, res) => {
    const provider = req.params.provider;
    const back = (outcome: Record<string, string>, returnPath = "/") =>
      res.redirect(
        `${env.WEB_ORIGIN}/auth/callback#${new URLSearchParams({
          ...outcome,
          return: returnPath,
        })}`,
      );

    if (
      !isProviderId(provider) ||
      !enabledProviders(secret).includes(provider)
    ) {
      return back({ error: "unknown_provider" });
    }

    let state;

    try {
      state = await takeState(req.query.state);
    } catch (error) {
      log.error("Failed to read the sign-in state", error);
      return back({ error: "unavailable" });
    }

    // Not the sign-in that was started here, or one that was used already or took too long.
    if (!state || state.provider !== provider) {
      return back({ error: "invalid_state" });
    }

    if (typeof req.query.code !== "string" || req.query.code.length > 2000) {
      return back(
        { error: req.query.error === "access_denied" ? "denied" : "failed" },
        state.returnPath,
      );
    }

    try {
      const profile = await profileFromCode(
        provider as ProviderId,
        req.query.code,
        state.verifier,
      );
      const user = await findUserByIdentity(`${provider}:${profile.id}`);

      if (user) {
        await updateUser(user.id, {
          lastLoginAt: new Date().toISOString(),
        }).catch((error) => log.error("Failed to note the sign-in", error));
        // A name the cache has lost is given back to its owner.
        await claimMemberName(user.id, user.nickname).catch(() => undefined);

        return back({ token: tokenFor(user) }, state.returnPath);
      }

      back(
        {
          provider,
          ticket: signTicket(
            {
              provider,
              providerUserId: profile.id,
              email: profile.email,
              emailVerified: profile.emailVerified,
              name: profile.name,
            },
            { secret, ttlMs: TICKET_TTL_MS },
          ),
          ...(profile.name ? { name: profile.name } : {}),
        },
        state.returnPath,
      );
    } catch (error) {
      // The message only: what the provider answered can carry a token or a code.
      log.error(
        "Sign-in with a provider failed",
        error instanceof Error ? error.message : "unknown error",
      );
      back({ error: "failed" }, state.returnPath);
    }
  });

  // Makes the account for somebody a provider has vouched for (the ticket), once they have a nickname, an avatar and
  // perhaps an age. The nickname is theirs from then on: nobody else can use it, in the chat or for another account.
  router.post(
    "/auth/register",
    limiter,
    express.json({ limit: "4kb" }),
    async (req, res) => {
      const body = registerBodySchema.safeParse(req.body ?? {});
      const ticket = body.success
        ? verifyTicket(body.data.ticket, { secret })
        : undefined;

      if (!body.success || !secret || !ticket) {
        return res.status(401).json({ error: "invalid_ticket" });
      }

      const age =
        body.data.age === undefined || body.data.age === null
          ? undefined
          : parseAge(body.data.age);

      if (
        body.data.age !== undefined &&
        body.data.age !== null &&
        age === undefined
      ) {
        return res.status(400).json({ error: "invalid_profile" });
      }

      try {
        const refusal = await nicknameRefusal(body.data.nickname);

        if (refusal) {
          return res
            .status(refusal === "invalid_nickname" ? 400 : 409)
            .json({ error: refusal });
        }

        const nickname = validateNickname(body.data.nickname) as string;
        const identity = `${ticket.provider}:${ticket.providerUserId}`;
        let user: UserRecord | undefined;

        try {
          user = await createUser({
            provider: ticket.provider,
            providerUserId: ticket.providerUserId,
            email: ticket.email,
            emailVerified: ticket.emailVerified,
            nickname,
            nicknameKey: normalizeName(nickname),
            avatar: parseAvatar(body.data.avatar),
            age,
          });
        } catch (error) {
          if (isTaken(error, "nicknameKey")) {
            return res.status(409).json({ error: "reserved_nickname" });
          }

          // The same ticket used twice: the account is there, so this is a sign-in.
          if (!isTaken(error, "identity")) throw error;

          user = await findUserByIdentity(identity);
          if (!user) throw error;
        }

        await claimMemberName(user.id, user.nickname).catch(() => undefined);

        res.json({
          token: tokenFor(user),
          profile: profileOf(user),
          provider: user.provider,
          expiresAt: Date.now() + MEMBER_TOKEN_TTL_MS,
        });
      } catch (error) {
        log.error(
          "Failed to make the account",
          error instanceof Error ? error.message : "unknown error",
        );
        res.status(503).json({ error: "unavailable" });
      }
    },
  );

  router.get("/me", limiter, async (req, res) => {
    const user = await memberOf(req, res);
    if (!user) return;

    res.set("Cache-Control", "no-store").json({
      profile: profileOf(user),
      provider: user.provider,
      token: tokenFor(user),
      expiresAt: Date.now() + MEMBER_TOKEN_TTL_MS,
    });
  });

  // Deletes the account: the entry in the admin goes, the nickname is free again, and whatever is connected as it is cut
  // off. What was said in a room is not theirs to take back (it is gone from the history within the hour).
  router.delete("/me", limiter, async (req, res) => {
    const user = await memberOf(req, res);
    if (!user) return;

    try {
      await deleteUser(user.id);
      await releaseMemberName(user.id, user.nickname).catch(() => undefined);
      await Promise.resolve(options.onAccountRemoved?.(user.id)).catch(
        (error) => log.error("Failed to cut off a deleted account", error),
      );

      res.json({ ok: true });
    } catch (error) {
      log.error(
        "Failed to delete the account",
        error instanceof Error ? error.message : "unknown error",
      );
      res.status(503).json({ error: "unavailable" });
    }
  });

  return router;
}
