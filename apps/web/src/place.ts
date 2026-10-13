const PREFIX = "/rooms/";

export const LOBBY_PATH = "/";

export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";

// Where a provider sends the browser back to, through the chat-server (see accounts.ts there).
export const AUTH_CALLBACK_PATH = "/auth/callback";

export const isAuthCallbackPath = (pathname: string) =>
  pathname.replace(/\/$/, "") === AUTH_CALLBACK_PATH;

// The terms or the privacy policy, when the address is theirs.
export function legalPageFromPath(
  pathname: string,
): "terms" | "privacy" | null {
  const path = pathname.replace(/\/$/, "");

  if (path === TERMS_PATH) return "terms";
  if (path === PRIVACY_PATH) return "privacy";
  return null;
}

export const roomPath = (slug: string) =>
  `${PREFIX}${encodeURIComponent(slug)}`;

// The room an address points at, or null for the lobby and anything else.
export function slugFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PREFIX)) return null;

  const slug = pathname.slice(PREFIX.length).replace(/\/$/, "");

  try {
    return slug ? decodeURIComponent(slug) : null;
  } catch {
    return null;
  }
}
