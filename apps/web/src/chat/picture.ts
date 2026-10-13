// What an account is shown by: a DiceBear style and the seed it draws from ("lorelei:k3j9x2ab"). Only these two words
// are kept and sent; the picture is drawn here (see pictureImage.ts). Must match apps/chat-server/src/avatars.ts (a
// test checks it).
export const PICTURE_STYLES = [
  "lorelei",
  "pixel-art",
  "critters",
  "thumbs",
] as const;

export type PictureStyle = (typeof PICTURE_STYLES)[number];

export const PICTURE_PATTERN =
  /^(lorelei|pixel-art|critters|thumbs):[a-z0-9]{6,16}$/;

// The picture, or undefined for anything that is not one: what arrives from the network or storage is not trusted.
export function parsePicture(value: unknown): string | undefined {
  return typeof value === "string" && PICTURE_PATTERN.test(value)
    ? value
    : undefined;
}

const SEED_LENGTH = 10;
const SEED_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SEED_LENGTH));

  return Array.from(
    bytes,
    (byte) => SEED_ALPHABET[byte % SEED_ALPHABET.length],
  ).join("");
}

// A row of pictures to choose from, the styles taking turns so that each is there to pick.
export function randomPictures(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      `${PICTURE_STYLES[index % PICTURE_STYLES.length]}:${randomSeed()}`,
  );
}

// One at random, for somebody who has not chosen.
export function randomPicture(): string {
  const style =
    PICTURE_STYLES[Math.floor(Math.random() * PICTURE_STYLES.length)];

  return `${style}:${randomSeed()}`;
}
