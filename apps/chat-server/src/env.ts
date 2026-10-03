import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
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
};
