const PREFIX = "/rooms/";

export const LOBBY_PATH = "/";

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
