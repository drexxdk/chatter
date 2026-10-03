import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Settings that must be a positive whole number. A bad value stops the server: quietly treating a typo (or a magic
// "0") as "off" would switch a protection off without anyone noticing.
function parsePositiveInt(
  name: string,
  raw: string | undefined,
  whenUnset: string,
): number | undefined {
  const text = raw?.trim();
  if (!text) return undefined;

  const value = Number(text);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `${name} must be a positive whole number, or left unset ${whenUnset} (got "${text}")`,
    );
  }

  return value;
}

// Absent when there is no limit.
export function optionalPositiveInt(
  name: string,
  raw: string | undefined,
): number | undefined {
  return parsePositiveInt(name, raw, "for no limit");
}

export function positiveIntOrDefault(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  return (
    parsePositiveInt(name, raw, `to use the default of ${fallback}`) ?? fallback
  );
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  PAYLOAD_URL: process.env.PAYLOAD_URL ?? "http://localhost:3000",
  PAYLOAD_SERVICE_API_KEY: required("PAYLOAD_SERVICE_API_KEY"),
  BAN_HASH_SALT: required("BAN_HASH_SALT"),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  INACTIVITY_TIMEOUT_MS: positiveIntOrDefault(
    "INACTIVITY_TIMEOUT_MS",
    process.env.INACTIVITY_TIMEOUT_MS,
    15 * 60_000,
  ),
  SYNC_INTERVAL_MS: Number(process.env.SYNC_INTERVAL_MS ?? 30_000),
  SOCKET_ADAPTER_KEY: process.env.SOCKET_ADAPTER_KEY ?? "socket.io",
  MAX_CONNECTIONS_PER_IP: optionalPositiveInt(
    "MAX_CONNECTIONS_PER_IP",
    process.env.MAX_CONNECTIONS_PER_IP,
  ),
  TRUST_PROXY_HOPS: Number(process.env.TRUST_PROXY_HOPS ?? 0),
};
