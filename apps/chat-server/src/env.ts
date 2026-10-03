import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// A limit that is simply absent when there is none. Anything else must be a positive whole number, and a bad value stops
// the server: quietly treating a typo as "no limit" would switch the protection off without anyone noticing.
export function optionalPositiveInt(
  name: string,
  raw: string | undefined,
): number | undefined {
  const text = raw?.trim();
  if (!text) return undefined;

  const value = Number(text);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `${name} must be a positive whole number, or left unset for no limit (got "${text}")`,
    );
  }

  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  PAYLOAD_URL: process.env.PAYLOAD_URL ?? "http://localhost:3000",
  PAYLOAD_SERVICE_API_KEY: required("PAYLOAD_SERVICE_API_KEY"),
  BAN_HASH_SALT: required("BAN_HASH_SALT"),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  INACTIVITY_TIMEOUT_MS: Number(
    process.env.INACTIVITY_TIMEOUT_MS ?? 15 * 60_000,
  ),
  SYNC_INTERVAL_MS: Number(process.env.SYNC_INTERVAL_MS ?? 30_000),
  SOCKET_ADAPTER_KEY: process.env.SOCKET_ADAPTER_KEY ?? "socket.io",
  MAX_CONNECTIONS_PER_IP: optionalPositiveInt(
    "MAX_CONNECTIONS_PER_IP",
    process.env.MAX_CONNECTIONS_PER_IP,
  ),
  TRUST_PROXY_HOPS: Number(process.env.TRUST_PROXY_HOPS ?? 0),
};
