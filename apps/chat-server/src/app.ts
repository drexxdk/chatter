import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";

import { env } from "./env.js";
import { getCachedPublicRooms } from "./rooms.js";

// Counted per process, like the per-IP connection cap.
const ROOMS_RATE_LIMIT = { max: 60, windowMs: 60_000 };

export function createApp(
  options: {
    roomsRateLimit?: { max: number; windowMs: number };
    trustedProxyHops?: number;
  } = {},
): express.Express {
  const roomsRateLimit = options.roomsRateLimit ?? ROOMS_RATE_LIMIT;
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
    rateLimit({
      limit: roomsRateLimit.max,
      windowMs: roomsRateLimit.windowMs,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: "rate_limited" });
      },
    }),
    async (_req, res) => {
      res.json(await getCachedPublicRooms());
    },
  );

  return app;
}
