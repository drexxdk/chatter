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

// The picture an account chooses to be shown by: a DiceBear style and the seed it draws from ("lorelei:k3j9x2ab"). The
// client draws it; the server only keeps the two words and checks they are ones it knows. Must match
// apps/web/src/chat/picture.ts (a test checks it).
export const PICTURE_STYLES = [
  "lorelei",
  "pixel-art",
  "critters",
  "thumbs",
] as const;

export const PICTURE_PATTERN =
  /^(lorelei|pixel-art|critters|thumbs):[a-z0-9]{6,16}$/;

export const pictureSchema = z.string().regex(PICTURE_PATTERN);

// Undefined for anything that is not a picture, so it is shown without one rather than turning somebody away.
export function parsePicture(value: unknown): string | undefined {
  const result = pictureSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
