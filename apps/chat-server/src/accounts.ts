import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { parseNotificationPreferences } from "../../../shared/notificationPreferences.mjs";

import { ageFromBirthDate, parseAge } from "./age.js";
import { parseAvatar, parsePicture } from "./avatars.js";
import { env } from "./env.js";
import { validateNickname, validateUsername } from "./identity.js";
import { log } from "./log.js";
import { cacheMemberNames, isMemberName } from "./members.js";
import { withMemberNamesLock } from "./memberNamesLock.js";
import { saveMemberProfile, validateProfileUpdate } from "./memberProfile.js";
import { withProfileLock } from "./profileLock.js";
import { MEMBER_TOKEN_TTL_MS, profileOf } from "./memberSession.js";
import { PasswordAccountError, signInPassword } from "./passwordAccounts.js";
import { hashPassword, passwordSchema, verifyPassword } from "./passwords.js";
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
  createStaffProvider,
  createMemberProvider,
  deleteStaffProvider,
  deleteMemberProvider,
  fetchMemberProviderLinks,
  fetchStaffAccount,
  changeStaffPassword,
  fetchStaffProviders,
  findStaffProvider,
  deleteUser,
  fetchUser,
  fetchNotificationOwner,
  saveNotificationPreferences,
  saveSidebarPreference,
  findUserByIdentity,
  isTaken,
  updateUser,
  type UserRecord,
} from "./payloadClient.js";
import { signTicket, verifyTicket } from "./tickets.js";
import { signToken, verifyToken } from "./tokens.js";
import { verifyHuman } from "./turnstile.js";

// How long an account stays signed in on a browser; /me hands out a fresh token each time the page opens, so somebody who
// keeps coming back stays in.
export { MEMBER_TOKEN_TTL_MS, profileOf } from "./memberSession.js";
// How long a person has to choose a nickname after the provider has vouched for them.
const TICKET_TTL_MS = 15 * 60_000;
const MAX_RETURN_PATH_LENGTH = 200;

const passwordChangeSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  password: passwordSchema,
  confirmation: z.string().max(128),
});

const registerBodySchema = z.object({
  ticket: z.string().min(1).max(2000),
  // The username (no spaces, kept private), and the name the chat shows.
  username: z.unknown().optional(),
  nickname: z.unknown().optional(),
  picture: z.unknown().optional(),
  avatar: z.unknown().optional(),
  age: z.unknown().optional(),
  birthDate: z.string().nullable().optional(),
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

// What the browser is told about an account: `nickname` is the name the chat shows, `username` the handle that is theirs.
// The names nobody may take: a moderator's, one that claims to be staff, and one an account has. A name that is not
// valid (null) is refused as such.
async function nameRefusal(
  name: string | null,
  unique = false,
): Promise<"invalid" | "reserved" | undefined> {
  if (!name) return "invalid";

  if (
    isReservedNickname(name, await getModeratorNames()) ||
    (unique && (await isMemberName(name)))
  ) {
    return "reserved";
  }

  return undefined;
}

export function createAccountsRouter(options: {
  authTokenSecret: string;
  rateLimit?: { max: number; windowMs: number };
  // For read-only account data and the provider list: the same generous limit as the list of rooms.
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

  const tokenFor = (user: UserRecord, authProvider?: string) =>
    signToken(
      {
        sub: user.id,
        name: user.nickname,
        role: "member",
        ...(authProvider ? { authProvider } : {}),
      },
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

  async function staffOf(req: express.Request, res: express.Response) {
    const header = req.get("authorization") ?? "";
    const claims = header.startsWith("Bearer ")
      ? verifyToken(header.slice(7), { secret })
      : undefined;
    if (!secret || claims?.role !== "moderator") {
      res.status(401).json({ error: "invalid_token" });
      return undefined;
    }
    const staff = await fetchStaffAccount(claims.sub);
    if (
      !staff?.displayName ||
      !["moderator", "super-admin"].includes(staff.role)
    ) {
      res.status(401).json({ error: "invalid_token" });
      return undefined;
    }
    return staff;
  }

  router.get("/me/staff", listLimiter, async (req, res) => {
    try {
      const staff = await staffOf(req, res);
      if (staff)
        res.set("Cache-Control", "no-store").json({
          name: staff.displayName,
          email: staff.email,
          admin: staff.role === "super-admin",
          provider:
            verifyToken((req.get("authorization") ?? "").slice(7), { secret })
              ?.authProvider ?? "password",
        });
    } catch {
      res.status(503).json({ error: "unavailable" });
    }
  });

  router.get("/me/providers", listLimiter, async (req, res) => {
    try {
      const owner = await providerOwner(req, res);
      if (owner)
        res.set("Cache-Control", "no-store").json(await connectionsOf(owner));
    } catch {
      res.status(503).json({ error: "unavailable" });
    }
  });

  router.post(
    "/me/providers/:provider/start",
    limiter,
    express.json({ limit: "1kb" }),
    async (req, res) => {
      try {
        const owner = await providerOwner(req, res);
        if (!owner) return;
        const provider = req.params.provider;
        if (
          !isProviderId(provider) ||
          !enabledProviders(secret).includes(provider)
        )
          return res.status(404).json({ error: "unknown_provider" });
        const verifier = newVerifier();
        const state = await saveState({
          provider,
          verifier,
          returnPath: safeReturnPath(req.body?.returnPath),
          ...(owner.kind === "staff"
            ? { staffAccountId: owner.id }
            : { memberAccountId: owner.user.id }),
        });
        res
          .set("Cache-Control", "no-store")
          .json({ url: authorizeUrl(provider, { state, verifier }) });
      } catch {
        res.status(503).json({ error: "unavailable" });
      }
    },
  );

  async function providerOwner(req: express.Request, res: express.Response) {
    const header = req.get("authorization") ?? "";
    const claims = header.startsWith("Bearer ")
      ? verifyToken(header.slice(7), { secret })
      : undefined;
    if (claims?.role === "member") {
      const user = await memberOf(req, res);
      if (!user) return undefined;
      if (typeof user.provider !== "string") {
        res.status(401).json({ error: "invalid_token" });
        return undefined;
      }
      return { kind: "member", user } as const;
    }
    const staff = await staffOf(req, res);
    return staff ? ({ kind: "staff", id: staff.id } as const) : undefined;
  }

  async function connectionsOf(
    owner: NonNullable<Awaited<ReturnType<typeof providerOwner>>>,
  ) {
    if (owner.kind === "staff")
      return {
        providers: [...new Set(await fetchStaffProviders(owner.id))],
        canDisconnect: true,
      };
    const links = await fetchMemberProviderLinks(owner.user.id);
    const providers = [
      ...new Set([
        ...(owner.user.provider === "password" ? [] : [owner.user.provider]),
        ...links.map((link) => link.provider),
      ]),
    ];
    return {
      providers,
      canDisconnect: Boolean(owner.user.passwordHash) || providers.length > 1,
    };
  }

  router.delete("/me/providers/:provider", limiter, async (req, res) => {
    try {
      await withMemberNamesLock(async () => {
        let owner = await providerOwner(req, res);
        if (!owner) return;
        const provider = req.params.provider;
        if (!isProviderId(provider))
          return res.status(404).json({ error: "unknown_provider" });
        const connections = await connectionsOf(owner);
        if (!connections.providers.includes(provider))
          return res.status(404).json({ error: "provider_not_connected" });
        if (!connections.canDisconnect)
          return res.status(409).json({ error: "last_sign_in_method" });
        if (
          owner.kind === "member" &&
          !owner.user.passwordHash &&
          !connections.providers.some(
            (candidate) =>
              candidate !== provider &&
              isProviderId(candidate) &&
              enabledProviders(secret).includes(candidate),
          )
        )
          return res.status(409).json({ error: "last_sign_in_method" });
        if (owner.kind === "staff") {
          await deleteStaffProvider(owner.id, provider);
        } else {
          const links = await fetchMemberProviderLinks(owner.user.id);
          if (owner.user.provider === provider) {
            const replacement = links.find(
              (link) =>
                link.provider !== provider &&
                isProviderId(link.provider) &&
                enabledProviders(secret).includes(link.provider),
            );
            const nextProvider = replacement?.provider ?? "password";
            const providerUserId = replacement
              ? replacement.identity.slice(replacement.provider.length + 1)
              : owner.user.nicknameKey;
            const user = await updateUser(owner.user.id, {
              provider: nextProvider,
              providerUserId,
              identity: `${nextProvider}:${providerUserId}`,
            });
            owner = { kind: "member", user };
          }
          for (const link of links.filter((link) => link.provider === provider))
            await deleteMemberProvider(link.id);
        }
        res.set("Cache-Control", "no-store").json(await connectionsOf(owner));
      });
    } catch {
      res.status(503).json({ error: "unavailable" });
    }
  });

  router.get("/auth/providers", listLimiter, (_req, res) => {
    res.json({
      providers: enabledProviders(secret),
      ...(env.TURNSTILE_SITE_KEY
        ? { turnstileSiteKey: env.TURNSTILE_SITE_KEY }
        : {}),
    });
  });

  router.post(
    "/auth/password/login",
    limiter,
    express.json({ limit: "4kb" }),
    async (req, res) => {
      if (!secret) return res.status(503).json({ error: "unavailable" });
      const humanError = await verifyHuman(
        req.body?.humanToken,
        "password_login",
        req.ip,
      );
      if (humanError)
        return res
          .status(humanError === "unavailable" ? 503 : 400)
          .json({ error: humanError });
      try {
        const session = await signInPassword(req.body, secret);
        res.set("Cache-Control", "no-store").json(session);
      } catch (error) {
        if (error instanceof PasswordAccountError) {
          return res.status(401).json({ error: "invalid_credentials" });
        }
        log.error("Password sign-in unavailable");
        res.status(503).json({ error: "unavailable" });
      }
    },
  );

  router.post(
    "/me/password",
    limiter,
    express.json({ limit: "4kb" }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const header = req.get("authorization") ?? "";
      const claims = header.startsWith("Bearer ")
        ? verifyToken(header.slice(7), { secret })
        : undefined;
      if (claims?.role === "moderator") {
        try {
          return await withProfileLock(`staff:${claims.sub}`, async () => {
            const staff = await staffOf(req, res);
            if (!staff) return;
            const parsed = passwordChangeSchema.safeParse(req.body);
            if (!parsed.success)
              return res.status(400).json({ error: "invalid_password" });
            if (parsed.data.password !== parsed.data.confirmation)
              return res.status(400).json({ error: "password_mismatch" });
            if (!staff.email)
              return res.status(503).json({ error: "unavailable" });
            if (!parsed.data.currentPassword)
              return res
                .status(403)
                .json({ error: "invalid_current_password" });
            if (
              !(await changeStaffPassword(
                { id: staff.id, email: staff.email },
                parsed.data.currentPassword,
                parsed.data.password,
              ))
            )
              return res
                .status(403)
                .json({ error: "invalid_current_password" });
            return res.json({ ok: true });
          });
        } catch {
          log.error("Staff password change unavailable");
          return res.status(503).json({ error: "unavailable" });
        }
      }
      const authenticated = await memberOf(req, res);
      if (!authenticated) return;
      return withProfileLock(`member:${authenticated.id}`, async () => {
        const user = await memberOf(req, res);
        if (!user) return;
        const parsed = passwordChangeSchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({ error: "invalid_password" });
        if (parsed.data.password !== parsed.data.confirmation)
          return res.status(400).json({ error: "password_mismatch" });
        try {
          if (
            user.passwordHash &&
            !(await verifyPassword(
              parsed.data.currentPassword ?? "",
              user.passwordHash,
            ))
          )
            return res.status(403).json({ error: "invalid_current_password" });
          await updateUser(user.id, {
            passwordHash: await hashPassword(parsed.data.password),
          });
          res.json({ ok: true });
        } catch {
          log.error("Password change unavailable");
          res.status(503).json({ error: "unavailable" });
        }
      });
    },
  );

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
      const identity = `${provider}:${profile.id}`;
      const staffResult = await withMemberNamesLock(async () => {
        if (state.memberAccountId !== undefined) return undefined;
        const existing = await findStaffProvider(identity);
        const staffId = state.staffAccountId ?? existing?.staff;
        if (staffId === undefined) return undefined;
        const staff = await fetchStaffAccount(staffId);
        if (
          !staff?.displayName ||
          !["moderator", "super-admin"].includes(staff.role)
        )
          return { error: "invalid_token" } as const;
        if (state.staffAccountId !== undefined) {
          if (
            (existing && existing.staff !== staff.id) ||
            (await findUserByIdentity(identity))
          )
            return { error: "provider_in_use" } as const;
          if (
            !existing &&
            (await fetchStaffProviders(staff.id)).includes(provider)
          )
            return { error: "provider_already_connected" } as const;
          if (!existing)
            await createStaffProvider(staff.id, provider, identity);
        }
        return { staff } as const;
      });
      if (staffResult) {
        if (staffResult.error !== undefined)
          return back({ error: staffResult.error }, state.returnPath);
        const staff = staffResult.staff;
        return back(
          {
            token: signToken(
              {
                sub: staff.id,
                name: staff.displayName!,
                role: "moderator",
                authProvider: provider,
              },
              { secret, ttlMs: 8 * 60 * 60_000 },
            ),
            staff: "1",
          },
          state.returnPath,
        );
      }
      const memberResult = await withMemberNamesLock(async () => {
        const account = await findUserByIdentity(`${provider}:${profile.id}`);

        if (state.memberAccountId !== undefined) {
          const owner = await fetchUser(state.memberAccountId);
          if (!owner) return { error: "invalid_token" } as const;
          if (
            (account && account.id !== owner.id) ||
            (await findStaffProvider(identity))
          )
            return { error: "provider_in_use" } as const;
          const connections = await connectionsOf({
            kind: "member",
            user: owner,
          });
          if (!account && connections.providers.includes(provider))
            return { error: "provider_already_connected" } as const;
          if (!account)
            await createMemberProvider(owner.id, provider, identity);
          return { user: owner } as const;
        }

        if (account) {
          await updateUser(account.id, {
            lastLoginAt: new Date().toISOString(),
          }).catch((error) => log.error("Failed to note the sign-in", error));
          await cacheMemberNames(account.id, [account.nickname]);
        }

        return { user: account } as const;
      });

      if (memberResult.error !== undefined)
        return back({ error: memberResult.error }, state.returnPath);
      const user = memberResult.user;
      if (user) {
        return back({ token: tokenFor(user, provider) }, state.returnPath);
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
    (req, res) =>
      withMemberNamesLock(async () => {
        const body = registerBodySchema.safeParse(req.body ?? {});
        const ticket = body.success
          ? verifyTicket(body.data.ticket, { secret })
          : undefined;

        if (!body.success || !secret || !ticket) {
          return res.status(401).json({ error: "invalid_ticket" });
        }

        const birthDate = body.data.birthDate ?? undefined;
        const age = birthDate
          ? ageFromBirthDate(birthDate)
          : body.data.age === undefined || body.data.age === null
            ? undefined
            : parseAge(body.data.age);

        if (
          (birthDate !== undefined ||
            (body.data.age !== undefined && body.data.age !== null)) &&
          age === undefined
        ) {
          return res.status(400).json({ error: "invalid_profile" });
        }

        try {
          const username = validateUsername(body.data.username);
          const usernameRefusal = await nameRefusal(username, true);

          if (usernameRefusal) {
            return res
              .status(usernameRefusal === "invalid" ? 400 : 409)
              .json({ error: `${usernameRefusal}_username` });
          }

          const displayName = validateNickname(body.data.nickname);
          const displayRefusal = await nameRefusal(displayName);

          if (displayRefusal) {
            return res
              .status(displayRefusal === "invalid" ? 400 : 409)
              .json({ error: `${displayRefusal}_nickname` });
          }

          const picture = parsePicture(body.data.picture);

          if (!picture)
            return res.status(400).json({ error: "invalid_profile" });

          const identity = `${ticket.provider}:${ticket.providerUserId}`;
          if (await findStaffProvider(identity))
            return res.status(409).json({ error: "provider_in_use" });
          let user: UserRecord | undefined = await findUserByIdentity(identity);

          try {
            user ??= await createUser({
              provider: ticket.provider,
              providerUserId: ticket.providerUserId,
              email: ticket.email,
              emailVerified: ticket.emailVerified,
              nickname: username as string,
              nicknameKey: normalizeName(username as string),
              displayName: displayName as string,
              displayNameKey: normalizeName(displayName as string),
              picture,
              avatar: parseAvatar(body.data.avatar),
              age,
              birthDate,
            });
          } catch (error) {
            if (isTaken(error, "nicknameKey")) {
              return res.status(409).json({ error: "reserved_username" });
            }

            if (isTaken(error, "displayNameKey")) {
              return res.status(409).json({ error: "reserved_nickname" });
            }

            // The same ticket used twice: the account is there, so this is a sign-in.
            if (!isTaken(error, "identity")) throw error;

            user = await findUserByIdentity(identity);
            if (!user) throw error;
          }

          await cacheMemberNames(user.id, [user.nickname]);

          res.json({
            token: tokenFor(user, ticket.provider),
            profile: profileOf(user),
            provider: ticket.provider,
            hasPassword: Boolean(user.passwordHash),
            expiresAt: Date.now() + MEMBER_TOKEN_TTL_MS,
          });
        } catch (error) {
          log.error(
            "Failed to make the account",
            error instanceof Error ? error.message : "unknown error",
          );
          res.status(503).json({ error: "unavailable" });
        }
      }),
  );

  const preferenceOwner = async (
    req: express.Request,
    res: express.Response,
  ) => {
    const header = req.get("authorization") ?? "";
    const claims = header.startsWith("Bearer ")
      ? verifyToken(header.slice(7), { secret })
      : undefined;
    if (!secret || !claims) {
      res.status(401).json({ error: "invalid_token" });
      return undefined;
    }
    const collection = claims.role === "member" ? "users" : "admins";
    const owner = await fetchNotificationOwner(collection, claims.sub);
    if (
      !owner ||
      (collection === "admins" &&
        !["moderator", "super-admin"].includes(owner.role ?? ""))
    ) {
      res.status(401).json({ error: "invalid_token" });
      return undefined;
    }
    return {
      collection,
      id: claims.sub,
      preferences: owner.notificationPreferences,
      sidebarOpen: owner.sidebarOpen ?? true,
    } as const;
  };

  router.get("/me/notifications", listLimiter, async (req, res) => {
    try {
      const owner = await preferenceOwner(req, res);
      if (!owner) return;
      res.set("Cache-Control", "no-store").json({
        preferences: parseNotificationPreferences(owner.preferences) ?? {
          enabled: false,
          volume: 0.5,
        },
      });
    } catch (error) {
      log.error("Failed to read notification preferences", error);
      res.status(503).json({ error: "unavailable" });
    }
  });

  router.patch(
    "/me/notifications",
    limiter,
    express.json({ limit: "4kb" }),
    async (req, res) => {
      try {
        const owner = await preferenceOwner(req, res);
        if (!owner) return;
        const preferences = parseNotificationPreferences(req.body);
        if (!preferences) {
          res.status(400).json({ error: "invalid_profile" });
          return;
        }
        await withProfileLock(
          `${owner.collection}:${owner.id}:notifications`,
          () =>
            saveNotificationPreferences(
              owner.collection,
              owner.id,
              preferences,
            ),
        );
        res.set("Cache-Control", "no-store").json({ preferences });
      } catch (error) {
        log.error("Failed to save notification preferences", error);
        res.status(503).json({ error: "unavailable" });
      }
    },
  );

  router.get("/me/sidebar", listLimiter, async (req, res) => {
    try {
      const owner = await preferenceOwner(req, res);
      if (!owner) return;
      res
        .set("Cache-Control", "no-store")
        .json({ sidebarOpen: owner.sidebarOpen });
    } catch (error) {
      log.error("Failed to read sidebar preference", error);
      res.status(503).json({ error: "unavailable" });
    }
  });

  router.patch(
    "/me/sidebar",
    limiter,
    express.json({ limit: "1kb" }),
    async (req, res) => {
      try {
        const owner = await preferenceOwner(req, res);
        if (!owner) return;
        const parsed = z
          .object({ sidebarOpen: z.boolean() })
          .safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_profile" });
          return;
        }
        const { sidebarOpen } = parsed.data;
        await withProfileLock(`${owner.collection}:${owner.id}:sidebar`, () =>
          saveSidebarPreference(owner.collection, owner.id, sidebarOpen),
        );
        res.set("Cache-Control", "no-store").json({ sidebarOpen });
      } catch (error) {
        log.error("Failed to save sidebar preference", error);
        res.status(503).json({ error: "unavailable" });
      }
    },
  );

  router.get("/me", listLimiter, async (req, res) => {
    const user = await memberOf(req, res);
    if (!user) return;
    const authProvider = verifyToken(
      (req.get("authorization") ?? "").slice(7),
      { secret },
    )?.authProvider;

    res.set("Cache-Control", "no-store").json({
      profile: profileOf(user),
      provider: authProvider ?? user.provider,
      hasPassword: Boolean(user.passwordHash),
      token: tokenFor(user, authProvider),
      expiresAt: Date.now() + MEMBER_TOKEN_TTL_MS,
    });
  });

  // Changes who the account is shown as, from the page of the lobby where there is no chat connection to do it with: the
  // display name, the picture, the avatar and the age, each only when it is in the body (an age of null takes it back).
  // Everything is checked before anything is saved.
  router.patch(
    "/me",
    limiter,
    express.json({ limit: "4kb" }),
    async (req, res) => {
      const authenticated = await memberOf(req, res);
      if (!authenticated) return;

      return withProfileLock(`member:${authenticated.id}`, async () => {
        const user = await memberOf(req, res);
        if (!user) return;

        try {
          const result = await validateProfileUpdate(
            {
              nickname: user.displayName,
              avatar: user.avatar,
              picture: user.picture,
              age: user.age,
              birthDate: user.birthDate,
            },
            req.body,
            user.id,
          );
          if (!result.ok) {
            const status =
              result.error === "reserved_nickname"
                ? 409
                : result.error === "unavailable"
                  ? 503
                  : 400;
            return res.status(status).json({ error: result.error });
          }
          const { nickname, avatar, picture, age, birthDate } = result.profile;

          const failure = await saveMemberProfile(
            user.id,
            user.nickname,
            user.displayName,
            result.profile,
          );

          if (failure) {
            if (typeof failure !== "string") {
              const retryAfterSeconds = Math.ceil(failure.retryAfterMs / 1000);
              return res
                .status(429)
                .set("Retry-After", String(retryAfterSeconds))
                .json({ error: failure.error, retryAfterSeconds });
            }
            return res
              .status(
                failure === "reserved_nickname" ||
                  failure === "reserved_username"
                  ? 409
                  : failure === "invalid_token"
                    ? 401
                    : 503,
              )
              .json({ error: failure });
          }

          res.json({
            profile: profileOf({
              ...user,
              nickname: result.profile.username ?? user.nickname,
              displayName: nickname,
              avatar,
              picture,
              age,
              birthDate,
            }),
          });
        } catch (error) {
          log.error(
            "Failed to change the profile",
            error instanceof Error ? error.message : "unknown error",
          );
          res.status(503).json({ error: "unavailable" });
        }
      });
    },
  );

  // Deletes the account: the entry in the admin goes, the nickname is free again, and whatever is connected as it is cut
  // off. What was said in a room is not theirs to take back (it is gone from the history within the hour).
  router.delete("/me", limiter, (req, res) =>
    withMemberNamesLock(async () => {
      const user = await memberOf(req, res);
      if (!user) return;

      try {
        await deleteUser(user.id);
        await cacheMemberNames(user.id, [], [user.nickname, user.displayName]);
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
    }),
  );

  return router;
}
