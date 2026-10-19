export {
  MAX_MESSAGE_LENGTH,
  NICKNAME_PATTERN,
  USERNAME_PATTERN,
} from "../../../shared/chatProtocol.mjs";

export function slidingWindow(
  times: number[],
  now: number,
  windowMs: number,
  max: number,
): { recent: number[]; waitMs: number } {
  const recent = times.filter((time) => now - time < windowMs);

  return {
    recent,
    waitMs: recent.length >= max ? (recent[0] ?? now) + windowMs - now : 0,
  };
}
