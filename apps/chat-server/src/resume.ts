import crypto from "node:crypto";

import { redis } from "./redis.js";

// A reload is a new connection. With the secret the server gave the old one, the new connection can take over the old
// identity (the same guest id), so private conversations and everything addressed to that id carry on. Anything the
// guest id alone gave away (it is shown to everybody in the room) must not be enough, hence the secret.
export const RESUME_TTL_SECONDS = 3600;

const MAX_GUEST_ID_LENGTH = 64;
const MAX_SECRET_LENGTH = 200;

const key = (guestId: string) => `chatter:resume:${guestId}`;
const hash = (secret: string) =>
  crypto.createHash("sha256").update(secret).digest("hex");

export const newResumeSecret = () => crypto.randomBytes(32).toString("hex");

// Only a hash is kept, so reading Redis is not enough to take anybody over.
export async function rememberResume(
  guestId: string,
  secret: string,
): Promise<void> {
  await redis.set(key(guestId), hash(secret), "EX", RESUME_TTL_SECONDS);
}

export async function verifyResume(
  guestId: string,
  secret: string,
): Promise<boolean> {
  if (
    !guestId ||
    !secret ||
    guestId.length > MAX_GUEST_ID_LENGTH ||
    secret.length > MAX_SECRET_LENGTH
  ) {
    return false;
  }

  const stored = await redis.get(key(guestId));
  if (!stored) return false;

  const expected = Buffer.from(stored);
  const received = Buffer.from(hash(secret));

  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}
