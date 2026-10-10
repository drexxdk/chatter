const MINUTE_MS = 60_000;
export const RELATIVE_MINUTES = 15;

// How a message's time is told: -1 as a clock time, 0 as "a few seconds ago", otherwise as that many minutes ago.
export function ageBucket(sentAt: string, now: number): number {
  const age = now - Date.parse(sentAt);

  if (!Number.isFinite(age) || age >= RELATIVE_MINUTES * MINUTE_MS) return -1;

  return Math.max(0, Math.floor(age / MINUTE_MS));
}
