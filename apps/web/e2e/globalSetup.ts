import { Redis } from "ioredis";

import { E2E } from "./constants";
import { PayloadApi } from "./payload";

// Room history outlives a run (it expires after an hour), so messages from earlier runs would fill the capped
// history and skew counts in the next one. The same goes for the latest announcement, which every new guest is shown.
async function clearLeftoverChatData() {
  const redis = new Redis(E2E.redisUrl);

  try {
    const keys = await redis.keys(`chatter:history:${E2E.slugPrefix}*`);
    await redis.del("chatter:announcement", ...keys);
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
  await clearLeftoverChatData();
}
