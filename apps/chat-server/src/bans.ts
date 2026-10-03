import { redis } from "./redis.js";
import { fetchBans, type Ban } from "./payloadClient.js";

const CACHE_KEY = "chatter:bans";
const SYNC_INTERVAL_MS = 30_000;

async function syncBans(): Promise<void> {
  const bans = await fetchBans();
  await redis.set(CACHE_KEY, JSON.stringify(bans));
}

async function getCachedBans(): Promise<Ban[]> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as Ban[]) : [];
}

export async function isBanned(identifierHash: string): Promise<boolean> {
  const bans = await getCachedBans();
  const now = Date.now();

  return bans.some(
    (ban) =>
      ban.identifierHash === identifierHash &&
      (!ban.expiresAt || new Date(ban.expiresAt).getTime() > now),
  );
}

// Polls Payload on an interval so ban checks at socket handshake never wait on an upstream HTTP call.
export function startBansSync(): NodeJS.Timeout {
  syncBans().catch((error) => console.error("Failed to sync bans:", error));

  return setInterval(() => {
    syncBans().catch((error) => console.error("Failed to sync bans:", error));
  }, SYNC_INTERVAL_MS);
}
