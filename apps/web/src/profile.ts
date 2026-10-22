import { ageFromBirthDate } from "../../../shared/chatProtocol.mjs";
export { ageFromBirthDate } from "../../../shared/chatProtocol.mjs";

export const MIN_AGE = 18;
export const MAX_AGE = 99;

export function readBirthDate(
  text: string,
): { ok: true; birthDate?: string; age?: number } | { ok: false } {
  if (!text.trim()) return { ok: true };
  const age = ageFromBirthDate(text);
  return age === undefined ? { ok: false } : { ok: true, birthDate: text, age };
}

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

  const age = /^\d{1,2}$/.test(trimmed) ? parseAge(Number(trimmed)) : undefined;

  return age === undefined ? { ok: false } : { ok: true, age };
}

export type { ProfileChanges } from "../../../shared/chatProtocol.mjs";
