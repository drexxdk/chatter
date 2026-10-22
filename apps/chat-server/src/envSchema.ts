import { z } from "zod";

// Blank counts as unset, so `FOO=` in a .env file behaves the same as leaving the line out.
const blankIsUnset = (value: unknown) => {
  if (typeof value !== "string") return value;
  return value.trim() || undefined;
};

const setting = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankIsUnset, schema);

// Strict on purpose: a typo that quietly became NaN, or a magic 0 meaning "off", would switch a protection off.
function wholeNumber(
  range: string,
  min: number,
  max: number,
  whenUnset: string,
) {
  return z.string().transform((raw, ctx) => {
    const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;

    if (!Number.isSafeInteger(value) || value < min || value > max) {
      ctx.issues.push({
        code: "custom",
        message: `must be a whole number ${range}, or left unset ${whenUnset} (got "${raw}")`,
        input: raw,
      });
      return z.NEVER;
    }

    return value;
  });
}

const positive = (whenUnset: string) =>
  wholeNumber("of 1 or more", 1, Number.MAX_SAFE_INTEGER, whenUnset);

const defaultOf = (value: number) => `to use the default of ${value}`;

// Never echo the value: connection strings can carry passwords.
const urlSetting = (protocol: RegExp, description: string) =>
  z.url({ protocol, error: `must be ${description}` });

const MIN_SALT_LENGTH = 16;
const MIN_TOKEN_SECRET_LENGTH = 32;

// CORS compares the Origin header exactly, so a trailing slash or a path would block every browser without a clue.
const ORIGIN_MESSAGE =
  "must be an origin such as https://chat.example.com, with no path or trailing slash";

const isOrigin = (value: string) =>
  URL.canParse(value) && new URL(value).origin === value;

export const envSchema = z
  .object({
    PORT: setting(
      wholeNumber("from 1 to 65535", 1, 65535, defaultOf(4000)).default(4000),
    ),
    REDIS_URL: setting(
      urlSetting(/^rediss?$/, "a redis:// or rediss:// URL").default(
        "redis://localhost:6379",
      ),
    ),
    PAYLOAD_URL: setting(
      urlSetting(/^https?$/, "an http:// or https:// URL").default(
        "http://localhost:3000",
      ),
    ),
    PAYLOAD_SERVICE_API_KEY: setting(z.string({ error: "is required" })),
    BAN_HASH_SALT: setting(
      z
        .string({ error: "is required" })
        .min(MIN_SALT_LENGTH, `must be at least ${MIN_SALT_LENGTH} characters`),
    ),
    WEB_ORIGIN: setting(
      z
        .url({ protocol: /^https?$/, error: ORIGIN_MESSAGE })
        .refine(isOrigin, { error: ORIGIN_MESSAGE })
        .default("http://localhost:5173"),
    ),
    INACTIVITY_TIMEOUT_MS: setting(
      positive(defaultOf(900_000)).default(900_000),
    ),
    SYNC_INTERVAL_MS: setting(positive(defaultOf(30_000)).default(30_000)),
    // For rooms whose slow mode is left empty in Payload. There is no way to switch it off.
    DEFAULT_SLOW_MODE_SECONDS: setting(positive(defaultOf(10)).default(10)),
    ROOM_HISTORY_SIZE: setting(
      wholeNumber("from 1 to 200", 1, 200, defaultOf(50)).default(50),
    ),
    ROOM_HISTORY_TTL_SECONDS: setting(
      wholeNumber("from 1 to 604800", 1, 604_800, defaultOf(3600)).default(
        3600,
      ),
    ),
    // How many different addresses must report a message before it is hidden for everybody until a moderator has seen it.
    REPORT_HIDE_THRESHOLD: setting(
      wholeNumber("from 1 to 50", 1, 50, defaultOf(3)).default(3),
    ),
    // Reports (with the text that was reported) are deleted from the admin after this many days.
    REPORT_RETENTION_DAYS: setting(
      wholeNumber("from 1 to 3650", 1, 3650, defaultOf(90)).default(90),
    ),
    // How often one address may fetch the room list per minute.
    ROOMS_RATE_LIMIT_PER_MINUTE: setting(positive(defaultOf(60)).default(60)),
    SOCKET_ADAPTER_KEY: setting(z.string().default("socket.io")),
    // Signs the moderator session tokens. Unset means moderators cannot sign in to the chat.
    AUTH_TOKEN_SECRET: setting(
      z
        .string()
        .min(
          MIN_TOKEN_SECRET_LENGTH,
          `must be at least ${MIN_TOKEN_SECRET_LENGTH} characters`,
        )
        .optional(),
    ),
    // Unset means no cap.
    MAX_CONNECTIONS_PER_IP: setting(positive("for no limit").optional()),
    // 0 is a real value here: no proxy in front of the server.
    TRUST_PROXY_HOPS: setting(
      wholeNumber(
        "of 0 or more",
        0,
        Number.MAX_SAFE_INTEGER,
        defaultOf(0),
      ).default(0),
    ),
    // The address of this server as the browser reaches it: where the providers send people back to.
    PUBLIC_API_URL: setting(
      z
        .url({ protocol: /^https?$/, error: ORIGIN_MESSAGE })
        .refine(isOrigin, { error: ORIGIN_MESSAGE })
        .optional(),
    ),
    // Each provider is switched on by having both of its settings; either alone is a mistake.
    GOOGLE_CLIENT_ID: setting(z.string().optional()),
    GOOGLE_CLIENT_SECRET: setting(z.string().optional()),
    FACEBOOK_APP_ID: setting(z.string().optional()),
    FACEBOOK_APP_SECRET: setting(z.string().optional()),
    DISCORD_CLIENT_ID: setting(z.string().optional()),
    DISCORD_CLIENT_SECRET: setting(z.string().optional()),
    TURNSTILE_SITE_KEY: setting(z.string().optional()),
    TURNSTILE_SECRET_KEY: setting(z.string().optional()),
    TURNSTILE_TEST_MODE: setting(
      z
        .enum(["true", "false"], { error: 'must be "true" or "false"' })
        .default("false")
        .transform((value) => value === "true"),
    ),
    // A stand-in provider for development and tests; refused when NODE_ENV is production.
    DEV_OAUTH: setting(
      z
        .enum(["true", "false"], { error: 'must be "true" or "false"' })
        .default("false")
        .transform((value) => value === "true"),
    ),
    NODE_ENV: setting(z.string().optional()),
  })
  .superRefine((value, ctx) => {
    const pairs = [
      ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
      ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
    ] as const;
    let anyProvider = value.DEV_OAUTH;

    for (const [id, secret] of pairs) {
      if (Boolean(value[id]) !== Boolean(value[secret])) {
        ctx.addIssue({
          code: "custom",
          path: [value[id] ? secret : id],
          message: `is required together with ${value[id] ? id : secret}`,
        });
      }

      if (id !== "TURNSTILE_SITE_KEY" && value[id] && value[secret])
        anyProvider = true;
    }

    if (anyProvider && !value.PUBLIC_API_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_API_URL"],
        message: "is required when a sign-in provider is set",
      });
    }

    if (anyProvider && !value.AUTH_TOKEN_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_TOKEN_SECRET"],
        message: "is required when a sign-in provider is set",
      });
    }

    if (value.DEV_OAUTH && value.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_OAUTH"],
        message: "must not be true in production",
      });
    }

    if (value.TURNSTILE_TEST_MODE && value.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_TEST_MODE"],
        message: "must not be true in production",
      });
    }

    for (const key of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"] as const) {
      if (
        value.NODE_ENV === "production" &&
        /^[123]x0{10,}/.test(value[key] ?? "")
      ) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "must not use a Turnstile test key in production",
        });
      }
    }
  })
  .transform((value) =>
    value.TURNSTILE_TEST_MODE
      ? {
          ...value,
          TURNSTILE_SITE_KEY: undefined,
          TURNSTILE_SECRET_KEY: undefined,
        }
      : value,
  );

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (result.success) return result.data;

  const lines = new Set(
    result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    ),
  );

  throw new Error(`Invalid environment variables:\n${[...lines].join("\n")}`);
}
