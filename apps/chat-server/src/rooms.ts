import { env } from "./env.js";
import { redis } from "./redis.js";
import { fetchPublicRooms, type PublicRoom } from "./payloadClient.js";
import { log } from "./log.js";

const CACHE_KEY = "chatter:public-rooms";

async function syncPublicRooms(): Promise<string> {
  const rooms = await fetchPublicRooms();
  const snapshot = JSON.stringify(rooms);
  await redis.set(CACHE_KEY, snapshot);
  return snapshot;
}

export async function getCachedPublicRooms(): Promise<PublicRoom[]> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as PublicRoom[]) : [];
}

// Polls Payload on an interval so socket connections never wait on an upstream HTTP call.
export function startPublicRoomsSync(
  onChanged?: () => unknown,
): NodeJS.Timeout {
  let previous: string | undefined;
  const sync = async () => {
    try {
      const snapshot = await syncPublicRooms();
      if (snapshot !== previous) {
        previous = snapshot;
        await onChanged?.();
      }
    } catch (error) {
      log.error("Failed to sync public rooms", error);
    }
  };
  void sync();
  return setInterval(() => void sync(), env.SYNC_INTERVAL_MS);
}
