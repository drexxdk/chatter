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

// The terms and the privacy policy are written in the admin; a database that has never been seeded has none, and every
// guest is then stopped at the pages that are to show them.
async function requireLegalText() {
  const response = await fetch(`${E2E.payloadUrl}/api/globals/legal`, {
    signal: AbortSignal.timeout(30_000),
  });
  const legal = response.ok
    ? ((await response.json()) as { terms?: { title?: string } })
    : undefined;

  if (!legal?.terms?.title) {
    throw new Error(
      "The terms and the privacy policy are not in the database: run `npm run seed --workspace apps/admin`.",
    );
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

  await requireLegalText();
  await payload.sweepLeftovers();
  await clearLeftoverChatData();
}
