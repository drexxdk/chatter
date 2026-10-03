import { env } from "./env.js";
import { redis } from "./redis.js";
import { fetchBans, type Ban } from "./payloadClient.js";

const CACHE_KEY = "chatter:bans";

// Called after every sync with the hashes that are banned right now, so a ban reaches guests already connected.
export type ActiveBansListener = (identifierHashes: string[]) => unknown;

const isActive = (ban: Ban, now: number) =>
  !ban.expiresAt || new Date(ban.expiresAt).getTime() > now;

async function syncBans(onActiveBans?: ActiveBansListener): Promise<void> {
  const bans = await fetchBans();
  await redis.set(CACHE_KEY, JSON.stringify(bans));

  const now = Date.now();
  const active = [
    ...new Set(
      bans.filter((ban) => isActive(ban, now)).map((ban) => ban.identifierHash),
    ),
  ];

  if (!onActiveBans || active.length === 0) return;

  // The list is already cached, so a failure here is not a failed sync.
  try {
    await onActiveBans(active);
  } catch (error) {
    console.error("Failed to enforce bans:", error);
  }
}

async function getCachedBans(): Promise<Ban[]> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as Ban[]) : [];
}

export async function isBanned(identifierHash: string): Promise<boolean> {
  const bans = await getCachedBans();
  const now = Date.now();

  return bans.some(
    (ban) => ban.identifierHash === identifierHash && isActive(ban, now),
  );
}

// Polls Payload on an interval so ban checks at socket handshake never wait on an upstream HTTP call.
export function startBansSync(
  onActiveBans?: ActiveBansListener,
): NodeJS.Timeout {
  const sync = () =>
    syncBans(onActiveBans).catch((error) =>
      console.error("Failed to sync bans:", error),
    );

  void sync();

  return setInterval(sync, env.SYNC_INTERVAL_MS);
}
