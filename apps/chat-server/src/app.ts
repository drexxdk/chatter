import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";

import { env } from "./env.js";
import { rememberModerator } from "./names.js";
import { loginAccount } from "./payloadClient.js";
import { chatRoleFor } from "./roles.js";
import { getCachedPublicRooms } from "./rooms.js";
import { signToken } from "./tokens.js";
import { log } from "./log.js";

// Counted per process, like the per-IP connection cap.
const ROOMS_RATE_LIMIT_WINDOW_MS = 60_000;
// Few, because every attempt is a guess at someone's password (and Payload locks an account after five of them).
const LOGIN_RATE_LIMIT = { max: 10, windowMs: 15 * 60_000 };
// How long a moderator stays signed in after the password was checked.
const TOKEN_TTL_MS = 8 * 60 * 60_000;

const loginBodySchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(200),
});

function limiter(limit: { max: number; windowMs: number }) {
  return rateLimit({
    limit: limit.max,
    windowMs: limit.windowMs,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: "rate_limited" });
    },
  });
}

export function createApp(
  options: {
    roomsRateLimit?: { max: number; windowMs: number };
    loginRateLimit?: { max: number; windowMs: number };
    trustedProxyHops?: number;
    // An empty string switches moderator sign-in off, like leaving AUTH_TOKEN_SECRET unset.
    authTokenSecret?: string;
  } = {},
): express.Express {
  const authTokenSecret = options.authTokenSecret ?? env.AUTH_TOKEN_SECRET;
  const app = express();

  // Same meaning as in socket.ts: the proxies you control, so X-Forwarded-For can't be forged past them.
  app.set("trust proxy", options.trustedProxyHops ?? env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get(
    "/rooms",
    limiter(
      options.roomsRateLimit ?? {
        max: env.ROOMS_RATE_LIMIT_PER_MINUTE,
        windowMs: ROOMS_RATE_LIMIT_WINDOW_MS,
      },
    ),
    async (_req, res) => {
      res.json(await getCachedPublicRooms());
    },
  );

  // Moderators prove who they are with their account's own email and password, which Payload checks. They get
  // back a signed token (no email, no password) that the socket accepts instead of a nickname.
  app.post(
    "/moderator/login",
    limiter(options.loginRateLimit ?? LOGIN_RATE_LIMIT),
    express.json({ limit: "2kb" }),
    async (req, res) => {
      if (!authTokenSecret) {
        return res.status(503).json({ error: "moderator_login_disabled" });
      }

      const body = loginBodySchema.safeParse(req.body ?? {});

      if (!body.success) {
        return res.status(400).json({ error: "invalid_request" });
      }

      let account;

      try {
        account = await loginAccount(body.data.email, body.data.password);
      } catch (error) {
        // Only the message: the stack of a failed sign-in call can carry what was sent.
        log.error(
          "Moderator sign-in failed",
          error instanceof Error ? error.message : "unknown error",
        );
        return res.status(503).json({ error: "unavailable" });
      }

      if (!account)
        return res.status(401).json({ error: "invalid_credentials" });

      const role = chatRoleFor(account.role);

      if (role !== "moderator") {
        return res.status(403).json({ error: "not_a_moderator" });
      }

      if (!account.displayName) {
        return res.status(403).json({ error: "no_display_name" });
      }

      try {
        await rememberModerator({
          id: account.id,
          name: account.displayName,
        });
      } catch (error) {
        log.error("Failed to record the moderator", error);
        return res.status(503).json({ error: "unavailable" });
      }

      const token = signToken(
        { sub: account.id, name: account.displayName, role },
        { secret: authTokenSecret, ttlMs: TOKEN_TTL_MS },
      );

      res.json({
        token,
        name: account.displayName,
        role,
        expiresAt: Date.now() + TOKEN_TTL_MS,
      });
    },
  );

  // Answers body-parser's complaints (too large, not JSON) in the same JSON shape as everything else.
  app.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (error.status === 413) {
        return res.status(413).json({ error: "payload_too_large" });
      }

      if (error.status === 400) {
        return res.status(400).json({ error: "invalid_request" });
      }

      next(error);
    },
  );

  return app;
}
