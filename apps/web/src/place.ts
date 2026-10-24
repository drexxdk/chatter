import { matchPath } from "react-router";

const PREFIX = "/rooms/";

export const LOBBY_PATH = "/";

export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";

// How the site is built and where the data goes.
export const ABOUT_PATH = "/about";
export const ROADMAP_PATH = "/roadmap";
export const VERSIONS_PATH = "/versions";

// Where a provider sends the browser back to, through the chat-server (see accounts.ts there).
export const AUTH_CALLBACK_PATH = "/auth/callback";

// The pages of the site that are not the chat, by the address they have.
export type SitePage = "terms" | "privacy" | "about" | "roadmap" | "versions";

const PAGE_PATHS: Record<SitePage, string> = {
  terms: TERMS_PATH,
  privacy: PRIVACY_PATH,
  about: ABOUT_PATH,
  roadmap: ROADMAP_PATH,
  versions: VERSIONS_PATH,
};

// The page an address is, or null for the lobby, a room and anything else.
export function pageFromPath(pathname: string): SitePage | null {
  for (const page of Object.keys(PAGE_PATHS) as SitePage[]) {
    if (matchPath(PAGE_PATHS[page], pathname)) return page;
  }

  return null;
}

export const roomPath = (slug: string) =>
  `${PREFIX}${encodeURIComponent(slug)}`;

// The room an address points at, or null for the lobby and anything else.
export function slugFromPath(pathname: string): string | null {
  return matchPath(`${PREFIX}:slug`, pathname)?.params.slug ?? null;
}
