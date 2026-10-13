// Mirrors validateNickname in apps/chat-server/src/identity.ts for instant feedback; the server stays authoritative.
export const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u;

// An account's username: the same, without spaces.
export const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]{2,24}$/u;

// Trimmed, with every run of spaces made one.
export function tidyName(raw: string): string {
  return raw.trim().replace(/ {2,}/g, " ");
}

// Returns the tidied nickname, or null if the server would reject it.
export function normalizeNickname(raw: string): string | null {
  const nickname = tidyName(raw);
  return NICKNAME_PATTERN.test(nickname) ? nickname : null;
}

// Returns the username as it will be kept, or null if the server would reject it.
export function normalizeUsername(raw: string): string | null {
  const username = raw.trim();
  return USERNAME_PATTERN.test(username) ? username : null;
}
