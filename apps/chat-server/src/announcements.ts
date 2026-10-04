import { z } from "zod";

import { redis } from "./redis.js";

// One announcement per moderator per minute keeps a moderator from flooding everyone, and a stolen token from doing
// much damage before it expires.
export const ANNOUNCE_COOLDOWN_MS = 60_000;
// Only the latest is kept, so someone connecting an hour later is not shown something stale.
export const ANNOUNCEMENT_TTL_SECONDS = 3600;

const LATEST_KEY = "chatter:announcement";
const cooldownKey = (accountId: number) =>
  `chatter:announce-cooldown:${accountId}`;

// Only the listed fields are kept, so nothing else ever reaches a client.
const announcementSchema = z.object({
  id: z.string(),
  text: z.string(),
  sentAt: z.iso.datetime(),
  name: z.string(),
});

export type Announcement = z.infer<typeof announcementSchema>;

export async function saveAnnouncement(
  announcement: Announcement,
): Promise<void> {
  await redis.set(
    LATEST_KEY,
    JSON.stringify(announcement),
    "EX",
    ANNOUNCEMENT_TTL_SECONDS,
  );
}

export async function getLatestAnnouncement(): Promise<
  Announcement | undefined
> {
  const stored = await redis.get(LATEST_KEY);
  if (!stored) return undefined;

  // A bad value must not stop anyone from connecting, so it counts as no announcement.
  try {
    const result = announcementSchema.safeParse(JSON.parse(stored));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

// Takes the moderator's turn if it is free, atomically, so two connections of the same account cannot both pass.
// Returns 0 when the turn was taken, otherwise how many milliseconds until the next one.
export async function claimAnnouncementSlot(
  accountId: number,
): Promise<number> {
  const key = cooldownKey(accountId);
  const claimed = await redis.set(key, "1", "PX", ANNOUNCE_COOLDOWN_MS, "NX");

  if (claimed === "OK") return 0;

  const remaining = await redis.pttl(key);
  return remaining > 0 ? remaining : ANNOUNCE_COOLDOWN_MS;
}
