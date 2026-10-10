// What is kept in this tab so that reloading the page puts a guest back where they were. It lives in session storage:
// it is per tab (two windows can be two different guests) and gone when the tab is closed.
import { AVATARS, PLAIN_AVATAR, type Avatar } from "./chat/avatar";
import { parseThreads, type DirectThread } from "./chat/direct";
import type { Resume } from "./chat/socket";
import { parseAge } from "./profile";

const KEY = "chatter.session";
const DIRECT_KEY = "chatter.direct";
const MAX_BLOCKED = 100;
// Only the latest are kept: each reload or reconnect adds one, and old messages fall out of the history anyway.
export const MAX_GUEST_IDS = 20;

export interface SavedSession {
  nickname: string;
  // Present for a moderator: the signed token the server gave them, never their email or password.
  token?: string;
  // Only when the guest chose one.
  avatar?: Avatar;
  // Only when the guest said how old they are.
  age?: number;
  // The ids the server gave this guest on earlier connections. A reload is a new connection with a new id, and these
  // are how what they wrote before is still shown as theirs.
  guestIds?: string[];
  // What the server needs to hand the same guest id to the next connection: the id and the secret of the last one.
  resume?: Resume;
}

function isResume(value: unknown): value is Resume {
  if (typeof value !== "object" || value === null) return false;

  const { guestId, secret } = value as Record<string, unknown>;

  return (
    typeof guestId === "string" &&
    guestId !== "" &&
    typeof secret === "string" &&
    secret !== ""
  );
}

export function loadSession(): SavedSession | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "null");

    if (typeof value !== "object" || value === null) return null;

    const { nickname, token, avatar, age, guestIds, resume } = value as Record<
      string,
      unknown
    >;

    if (typeof nickname !== "string" || !nickname) return null;
    if (token !== undefined && typeof token !== "string") return null;

    const ids = Array.isArray(guestIds)
      ? guestIds.filter(
          (id): id is string => typeof id === "string" && id !== "",
        )
      : [];
    const resumable = isResume(resume) ? resume : undefined;

    return {
      nickname,
      ...(token === undefined ? {} : { token }),
      ...(AVATARS.find((known) => known === avatar)
        ? { avatar: avatar as Avatar }
        : {}),
      ...(parseAge(age) === undefined ? {} : { age: parseAge(age) }),
      ...(ids.length > 0 ? { guestIds: ids.slice(-MAX_GUEST_IDS) } : {}),
      ...(resumable ? { resume: resumable } : {}),
    };
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        ...session,
        ...(session.guestIds
          ? { guestIds: session.guestIds.slice(-MAX_GUEST_IDS) }
          : {}),
      }),
    );
  } catch {
    // Storage can be full or switched off; the chat works the same, it just cannot be resumed.
  }
}

// A new connection has a new id and a new secret, which must be remembered too. Does nothing when no session is
// saved, so it cannot bring one back after it was forgotten.
export function rememberConnection(update: {
  guestIds: string[];
  resume: Resume | null;
}): void {
  const saved = loadSession();

  if (!saved || update.guestIds.length === 0) return;

  saveSession({
    ...saved,
    guestIds: update.guestIds,
    ...(update.resume ? { resume: update.resume } : {}),
  });
}

// The guest changed who they are shown as, so a reload must bring them back as that. Does nothing for a moderator
// (their name is their account's) or when no session is saved.
export function rememberProfile(profile: {
  nickname: string;
  avatar?: Avatar;
  age?: number;
}): void {
  const saved = loadSession();

  if (!saved || saved.token) return;

  const { avatar: _avatar, age: _age, ...rest } = saved;

  saveSession({
    ...rest,
    nickname: profile.nickname,
    ...(profile.avatar && profile.avatar !== PLAIN_AVATAR
      ? { avatar: profile.avatar }
      : {}),
    ...(profile.age === undefined ? {} : { age: profile.age }),
  });
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(DIRECT_KEY);
  } catch {
    // See saveSession.
  }
}

// What the guest had open, kept for a reload: private conversations live only in the page, so without this a reload
// would empty them.
export interface SavedDirect {
  threads: DirectThread[];
  blockedIds: string[];
  // The conversation that was open.
  openGuestId?: string;
}

export function loadDirect(): SavedDirect {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(DIRECT_KEY) ?? "null",
    );
    const { threads, blockedIds, openGuestId } = (value ?? {}) as Record<
      string,
      unknown
    >;

    return {
      threads: parseThreads(threads),
      blockedIds: Array.isArray(blockedIds)
        ? blockedIds
            .filter((id): id is string => typeof id === "string" && id !== "")
            .slice(0, MAX_BLOCKED)
        : [],
      ...(typeof openGuestId === "string" && openGuestId !== ""
        ? { openGuestId }
        : {}),
    };
  } catch {
    return { threads: [], blockedIds: [] };
  }
}

// Only while a session is saved, so it cannot bring conversations back after the connection ended for good.
export function saveDirect(direct: SavedDirect): void {
  if (!loadSession()) return;

  try {
    sessionStorage.setItem(DIRECT_KEY, JSON.stringify(direct));
  } catch {
    // See saveSession.
  }
}
