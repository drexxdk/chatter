import { Redis } from "ioredis";

import { E2E } from "./constants";
import { PayloadApi } from "./payload";

// Room history outlives a run (it expires after an hour), so messages from earlier runs would fill the capped
// history and skew counts in the next one.
async function clearRoomHistories() {
  const redis = new Redis(E2E.redisUrl);

  try {
    const keys = await redis.keys(`chatter:history:${E2E.slugPrefix}*`);
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

export default async function globalSetup() {
  const payload = new PayloadApi();

  try {
    await payload.login();
  } catch (error) {
    throw new Error(
      "The e2e tests need apps/admin running on http://localhost:3000 with its database seeded " +
        `(npm run dev:admin). ${error instanceof Error ? error.message : error}`,
    );
  }

  await payload.sweepLeftovers();
  await clearRoomHistories();
}
