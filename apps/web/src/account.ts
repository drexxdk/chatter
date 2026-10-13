// The account of somebody who connected a provider, kept in this browser so that the next visit (and the next tab) is
// signed in. It lives in local storage, unlike the guest's session, which is per tab. It holds the signed token the
// server gave, never anything the provider knows.
import type { AccountSession } from "./api";
import { AVATARS, type Avatar } from "./chat/avatar";
import { parsePicture } from "./chat/picture";
import { parseAge } from "./profile";

const KEY = "chatter.account";

export interface Account {
  token: string;
  // google, facebook or discord.
  provider: string;
  // The name the chat shows (the account's display name).
  nickname: string;
  // The handle that is theirs alone, never shown in the chat. Absent on what an older version kept.
  username?: string;
  picture?: string;
  avatar?: Avatar;
  age?: number;
  // When the token stops working, in milliseconds since 1970.
  expiresAt: number;
}

// What the browser keeps of an account the server has just described.
export function accountOf(session: AccountSession): Account {
  const { token, provider, profile, expiresAt } = session;

  return {
    token,
    provider,
    nickname: profile.nickname,
    ...(profile.username ? { username: profile.username } : {}),
    ...(profile.picture ? { picture: profile.picture } : {}),
    avatar: profile.avatar,
    ...(profile.age === undefined ? {} : { age: profile.age }),
    expiresAt,
  };
}

export function loadAccount(now = Date.now()): Account | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");

    if (typeof value !== "object" || value === null) return null;

    const {
      token,
      provider,
      nickname,
      username,
      picture,
      avatar,
      age,
      expiresAt,
    } = value as Record<string, unknown>;

    if (
      typeof token !== "string" ||
      !token ||
      typeof provider !== "string" ||
      typeof nickname !== "string" ||
      !nickname ||
      typeof expiresAt !== "number" ||
      expiresAt <= now
    ) {
      return null;
    }

    return {
      token,
      provider,
      nickname,
      ...(typeof username === "string" && username ? { username } : {}),
      ...(parsePicture(picture) === undefined
        ? {}
        : { picture: parsePicture(picture) }),
      ...(AVATARS.find((known) => known === avatar)
        ? { avatar: avatar as Avatar }
        : {}),
      ...(parseAge(age) === undefined ? {} : { age: parseAge(age) }),
      expiresAt,
    };
  } catch {
    return null;
  }
}

export function saveAccount(account: Account): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // Storage can be full or switched off; the account then only lasts until the page is closed.
  }
}

export function clearAccount(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
