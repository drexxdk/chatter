// How somebody chooses to be shown next to their messages. Self-declared and optional; anything missing or unknown is
// the plain one. Must match apps/chat-server/src/avatars.ts.
export const AVATARS = ["male", "female", "trans", "other"] as const;

export type Avatar = (typeof AVATARS)[number];

export const PLAIN_AVATAR: Avatar = "other";

export function parseAvatar(value: unknown): Avatar {
  return AVATARS.find((avatar) => avatar === value) ?? PLAIN_AVATAR;
}
