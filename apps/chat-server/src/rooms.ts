import { env } from "./env.js";
import { redis } from "./redis.js";
import { fetchPublicRooms, type PublicRoom } from "./payloadClient.js";

const CACHE_KEY = "chatter:public-rooms";

async function syncPublicRooms(): Promise<void> {
  const rooms = await fetchPublicRooms();
  await redis.set(CACHE_KEY, JSON.stringify(rooms));
}

export async function getCachedPublicRooms(): Promise<PublicRoom[]> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as PublicRoom[]) : [];
}

// Polls Payload on an interval so socket connections never wait on an upstream HTTP call.
export function startPublicRoomsSync(): NodeJS.Timeout {
  syncPublicRooms().catch((error) =>
    console.error("Failed to sync public rooms:", error),
  );

  return setInterval(() => {
    syncPublicRooms().catch((error) =>
      console.error("Failed to sync public rooms:", error),
    );
  }, env.SYNC_INTERVAL_MS);
}
