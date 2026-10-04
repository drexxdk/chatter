import { z } from "zod";

// How a person chooses to be shown next to their messages. Self-declared and optional, so the plain one is what
// anybody gets who does not say; moderators have none to choose until accounts have a profile.
export const AVATARS = ["male", "female", "trans", "other"] as const;

export const avatarSchema = z.enum(AVATARS);

export type Avatar = z.infer<typeof avatarSchema>;

// Anything that is not a known avatar becomes the plain one: not worth turning somebody away over.
export function parseAvatar(value: unknown): Avatar {
  const result = avatarSchema.safeParse(value);
  return result.success ? result.data : "other";
}
