// A guest may say how old they are; it is shown to the others in the room. Optional, and anything that is not a whole
// number in this range is treated as not said.
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
