// Mirrors validateNickname in apps/chat-server/src/identity.ts for instant feedback; the server stays authoritative.
const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u;

// Returns the trimmed nickname, or null if the server would reject it.
export function normalizeNickname(raw: string): string | null {
  const nickname = raw.trim();
  return NICKNAME_PATTERN.test(nickname) ? nickname : null;
}
