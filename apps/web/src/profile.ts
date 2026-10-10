// Mirrors the chat-server's limits on a guest's age (apps/chat-server/src/age.ts); the server stays authoritative.
export const MIN_AGE = 18;
export const MAX_AGE = 120;

export function parseAge(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_AGE &&
    value <= MAX_AGE
    ? value
    : undefined;
}

// What a guest typed in the age box: nothing is fine (age is optional), a whole number in range is the age, anything
// else is wrong.
export function readAge(
  text: string,
): { ok: true; age?: number } | { ok: false } {
  const trimmed = text.trim();

  if (trimmed === "") return { ok: true };

  const age = /^\d{1,3}$/.test(trimmed) ? parseAge(Number(trimmed)) : undefined;

  return age === undefined ? { ok: false } : { ok: true, age };
}

// What a guest may change about themselves while in a room.
export interface ProfileChanges {
  nickname?: string;
  avatar?: import("./chat/avatar").Avatar;
  // null takes the age back.
  age?: number | null;
}
