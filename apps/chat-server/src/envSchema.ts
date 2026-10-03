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

// CORS compares the Origin header exactly, so a trailing slash or a path would block every browser without a clue.
const ORIGIN_MESSAGE =
  "must be an origin such as https://chat.example.com, with no path or trailing slash";

const isOrigin = (value: string) =>
  URL.canParse(value) && new URL(value).origin === value;

export const envSchema = z.object({
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
  INACTIVITY_TIMEOUT_MS: setting(positive(defaultOf(900_000)).default(900_000)),
  SYNC_INTERVAL_MS: setting(positive(defaultOf(30_000)).default(30_000)),
  ROOM_HISTORY_SIZE: setting(
    wholeNumber("from 1 to 200", 1, 200, defaultOf(50)).default(50),
  ),
  ROOM_HISTORY_TTL_SECONDS: setting(
    wholeNumber("from 1 to 604800", 1, 604_800, defaultOf(3600)).default(3600),
  ),
  SOCKET_ADAPTER_KEY: setting(z.string().default("socket.io")),
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
});

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
