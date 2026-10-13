// The account of somebody who connected a provider, kept in this browser so that the next visit (and the next tab) is
// signed in. It lives in local storage, unlike the guest's session, which is per tab. It holds the signed token the
// server gave, never anything the provider knows.
import { AVATARS, type Avatar } from "./chat/avatar";
import { parseAge } from "./profile";

const KEY = "chatter.account";

export interface Account {
  token: string;
  // google, facebook or discord.
  provider: string;
  nickname: string;
  avatar?: Avatar;
  age?: number;
  // When the token stops working, in milliseconds since 1970.
  expiresAt: number;
}

export function loadAccount(now = Date.now()): Account | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");

    if (typeof value !== "object" || value === null) return null;

    const { token, provider, nickname, avatar, age, expiresAt } =
      value as Record<string, unknown>;

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
