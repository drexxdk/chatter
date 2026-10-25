import { parseAvatar, type Avatar } from "./chat/avatar";
import {
  parseNotificationPreferences,
  type NotificationSoundPreferences,
} from "../../../shared/notificationPreferences.mjs";
import { parsePicture } from "./chat/picture";
import { CHAT_SERVER_URL } from "./config";
import { parseLegal, type LegalContent } from "./legal";
import { ageFromBirthDate, parseAge, type ProfileChanges } from "./profile";

export interface Room {
  id: number;
  name: string;
  slug: string;
  // Absent or null means the room has no limit.
  maxMembers?: number | null;
  // Seconds a guest must wait between messages; absent only when talking to an older chat server.
  slowModeSeconds?: number | null;
  description?: string | null;
  // The name and description in the languages other than English, where somebody has written them; absent when there
  // are none (or when talking to an older chat server).
  translations?: Record<string, { name?: string; description?: string }>;
  // How many are in the room now; absent when talking to an older chat server.
  memberCount?: number;
}

// The room with its name and description in the language, where they are written in it, and in English otherwise.
export function localizeRoom(room: Room, language: string | undefined): Room {
  const translated = language ? room.translations?.[language] : undefined;

  if (!translated) return room;

  return {
    ...room,
    name: translated.name ?? room.name,
    description: translated.description ?? room.description,
  };
}

export async function fetchRooms(signal?: AbortSignal): Promise<Room[]> {
  const response = await fetch(`${CHAT_SERVER_URL}/rooms`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to load rooms: ${response.status}`);
  }

  return (await response.json()) as Room[];
}

// The terms of use and the privacy policy; nothing when the admin has not published them yet or the server has no copy.
export async function fetchLegal(signal?: AbortSignal): Promise<LegalContent> {
  const response = await fetch(`${CHAT_SERVER_URL}/legal`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to load the terms: ${response.status}`);
  }

  const legal = parseLegal(await response.json());

  if (!legal) throw new Error("The terms are not in the shape expected");

  return legal;
}

export interface ModeratorSession {
  token: string;
  name: string;
}

// Carries a code the interface can translate (see `errors.*` in the locales).
export class SignInError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const SIGN_IN_ERRORS = new Set([
  "invalid_credentials",
  "not_a_moderator",
  "no_display_name",
  "moderator_login_disabled",
  "unavailable",
  "invalid_request",
  "human_check_required",
  "human_check_failed",
]);

export async function signInModerator(
  email: string,
  password: string,
  humanToken?: string,
): Promise<ModeratorSession> {
  let response: Response;

  try {
    response = await fetch(`${CHAT_SERVER_URL}/moderator/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        ...(humanToken ? { humanToken } : {}),
      }),
    });
  } catch {
    throw new SignInError("connection");
  }

  const body: unknown = await response.json().catch(() => null);
  const fields = (body ?? {}) as Record<string, unknown>;

  if (!response.ok) {
    if (response.status === 429) throw new SignInError("too_many_attempts");
    if (response.status === 413) throw new SignInError("invalid_request");

    throw new SignInError(
      typeof fields.error === "string" && SIGN_IN_ERRORS.has(fields.error)
        ? fields.error
        : "connection",
    );
  }

  if (typeof fields.token !== "string" || typeof fields.name !== "string") {
    throw new SignInError("connection");
  }

  return { token: fields.token, name: fields.name };
}

// The providers the chat-server has switched on (Google, Facebook, Discord); none when it has none or cannot be reached,
// since the chat works without them. Every part of the page that offers them asks, so the answer is kept for the page;
// an answer that did not come is not kept, and the next part asks again.
interface AuthConfiguration {
  providers: string[];
  turnstileSiteKey: string | null;
}

let providersRequest: Promise<AuthConfiguration | undefined> | undefined;

async function loadAuthProviders(): Promise<AuthConfiguration | undefined> {
  try {
    const response = await fetch(`${CHAT_SERVER_URL}/auth/providers`);

    if (!response.ok) return undefined;

    const body = (await response.json()) as {
      providers?: unknown;
      turnstileSiteKey?: unknown;
    };

    const providers = Array.isArray(body.providers)
      ? body.providers.filter(
          (provider): provider is string => typeof provider === "string",
        )
      : [];
    return {
      providers,
      turnstileSiteKey:
        typeof body.turnstileSiteKey === "string" && body.turnstileSiteKey
          ? body.turnstileSiteKey
          : null,
    };
  } catch {
    return undefined;
  }
}

export async function fetchAuthConfiguration(): Promise<
  AuthConfiguration | undefined
> {
  providersRequest ??= loadAuthProviders();
  const providers = await providersRequest;

  if (providers === undefined) providersRequest = undefined;

  return providers;
}

export async function fetchAuthProviders(): Promise<string[]> {
  return (await fetchAuthConfiguration())?.providers ?? [];
}

// For tests: forget what the chat-server said, so the next page asks again.
export function forgetAuthProviders(): void {
  providersRequest = undefined;
}

// Where the browser is sent to sign in with a provider; it comes back to `returnPath` (a path of this site).
export const authStartUrl = (provider: string, returnPath: string) =>
  `${CHAT_SERVER_URL}/auth/${encodeURIComponent(provider)}/start?return=${encodeURIComponent(returnPath)}`;

export interface AccountSession {
  token: string;
  provider: string;
  hasPassword?: boolean;
  // `nickname` is the name the chat shows; `username` is the handle that is theirs alone.
  profile: {
    nickname: string;
    username?: string;
    picture?: string;
    avatar: Avatar;
    age?: number;
    birthDate?: string;
  };
  expiresAt: number;
}

// Carries a code the interface can translate (see `errors.*` in the locales).
export class AccountError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

const ACCOUNT_ERRORS = new Set([
  "invalid_ticket",
  "invalid_token",
  "invalid_nickname",
  "reserved_nickname",
  "invalid_username",
  "reserved_username",
  "invalid_profile",
  "display_name_cooldown",
  "invalid_credentials",
  "invalid_password",
  "password_mismatch",
  "invalid_current_password",
  "password_not_supported",
  "human_check_required",
  "human_check_failed",
  "unavailable",
]);

function parseAccountProfile(value: unknown): AccountSession["profile"] {
  const profile = (value ?? {}) as Record<string, unknown>;
  const age = parseAge(profile.age);
  const birthDate =
    ageFromBirthDate(profile.birthDate) === undefined
      ? undefined
      : (profile.birthDate as string);

  if (typeof profile.nickname !== "string")
    throw new AccountError("connection");

  return {
    nickname: profile.nickname,
    ...(typeof profile.username === "string" && profile.username
      ? { username: profile.username }
      : {}),
    ...(parsePicture(profile.picture) === undefined
      ? {}
      : { picture: parsePicture(profile.picture) }),
    avatar: parseAvatar(profile.avatar),
    ...(age === undefined ? {} : { age }),
    ...(birthDate === undefined ? {} : { birthDate }),
  };
}

export function parseAccountSession(body: unknown): AccountSession {
  const fields = (body ?? {}) as Record<string, unknown>;

  if (
    typeof fields.token !== "string" ||
    typeof fields.provider !== "string" ||
    typeof fields.expiresAt !== "number"
  ) {
    throw new AccountError("connection");
  }

  return {
    token: fields.token,
    provider: fields.provider,
    ...(typeof fields.hasPassword === "boolean"
      ? { hasPassword: fields.hasPassword }
      : {}),
    expiresAt: fields.expiresAt,
    profile: parseAccountProfile(fields.profile),
  };
}

async function accountRequest(
  path: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${CHAT_SERVER_URL}${path}`, init);
  } catch {
    throw new AccountError("connection");
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code = (body as { error?: unknown } | null)?.error;

    if (response.status === 429) {
      const seconds = (body as { retryAfterSeconds?: unknown } | null)
        ?.retryAfterSeconds;
      if (
        code === "display_name_cooldown" &&
        typeof seconds === "number" &&
        Number.isFinite(seconds) &&
        seconds > 0
      ) {
        throw new AccountError(code, Math.ceil(seconds));
      }
      throw new AccountError("too_many_attempts");
    }

    throw new AccountError(
      typeof code === "string" && ACCOUNT_ERRORS.has(code)
        ? code
        : "connection",
    );
  }

  return body;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface PasswordClaim {
  username: string;
  password: string;
  confirmation: string;
}

export interface PasswordChange {
  currentPassword?: string;
  password: string;
  confirmation: string;
}

export async function changeAccountPassword(
  token: string,
  input: PasswordChange,
): Promise<void> {
  await accountRequest("/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearer(token) },
    body: JSON.stringify(input),
  });
}

export async function signInPassword(
  username: string,
  password: string,
  humanToken?: string,
): Promise<AccountSession> {
  return parseAccountSession(
    await accountRequest("/auth/password/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        ...(humanToken ? { humanToken } : {}),
      }),
    }),
  );
}

// Makes the account for somebody a provider has vouched for (the ticket), with who they want to be shown as: a
// username of their own, the name the chat shows, and a picture.
export async function registerAccount(input: {
  ticket: string;
  username: string;
  nickname: string;
  picture: string;
  avatar: Avatar;
  age?: number;
  birthDate?: string;
}): Promise<AccountSession> {
  return parseAccountSession(
    await accountRequest("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

// Who the token belongs to, and the token renewed. Fails with `invalid_token` when it no longer works.
export async function fetchNotificationPreferences(token: string) {
  const body = await accountRequest("/me/notifications", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const preferences = parseNotificationPreferences(
    (body as { preferences?: unknown } | null)?.preferences,
  );
  if (!preferences) throw new AccountError("connection");
  return preferences;
}

export async function updateNotificationPreferences(
  token: string,
  preferences: NotificationSoundPreferences,
): Promise<void> {
  await accountRequest("/me/notifications", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
  });
}

export async function fetchSidebarPreference(token: string): Promise<boolean> {
  const body = await accountRequest("/me/sidebar", {
    headers: bearer(token),
  });
  const open = (body as { sidebarOpen?: unknown } | null)?.sidebarOpen;
  if (typeof open !== "boolean") throw new AccountError("connection");
  return open;
}

export async function updateSidebarPreference(
  token: string,
  sidebarOpen: boolean,
): Promise<void> {
  await accountRequest("/me/sidebar", {
    method: "PATCH",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify({ sidebarOpen }),
  });
}

export async function fetchAccount(token: string): Promise<AccountSession> {
  return parseAccountSession(
    await accountRequest("/me", { headers: bearer(token) }),
  );
}

export async function fetchStaffSession(
  token: string,
): Promise<{ name: string; admin: boolean; provider?: string }> {
  const body = (await accountRequest("/me/staff", {
    headers: bearer(token),
  })) as { name?: unknown; admin?: unknown; provider?: unknown };
  if (typeof body?.name !== "string" || typeof body.admin !== "boolean")
    throw new AccountError("connection");
  return {
    name: body.name,
    admin: body.admin,
    ...(typeof body.provider === "string" ? { provider: body.provider } : {}),
  };
}

export interface ProviderConnections {
  providers: string[];
  canDisconnect: boolean;
}

function parseProviderConnections(value: unknown): ProviderConnections {
  const body = value as { providers?: unknown; canDisconnect?: unknown };
  if (
    !Array.isArray(body?.providers) ||
    !body.providers.every((value) => typeof value === "string")
  )
    throw new AccountError("connection");
  return {
    providers: body.providers,
    canDisconnect: body.canDisconnect === true,
  };
}

export async function fetchProviderConnections(
  token: string,
): Promise<ProviderConnections> {
  return parseProviderConnections(
    await accountRequest("/me/providers", { headers: bearer(token) }),
  );
}

export async function disconnectProvider(
  token: string,
  provider: string,
): Promise<ProviderConnections> {
  return parseProviderConnections(
    await accountRequest(`/me/providers/${encodeURIComponent(provider)}`, {
      method: "DELETE",
      headers: bearer(token),
    }),
  );
}

export async function startProviderLink(
  token: string,
  provider: string,
  returnPath: string,
): Promise<string> {
  const body = (await accountRequest(
    `/me/providers/${encodeURIComponent(provider)}/start`,
    {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ returnPath }),
    },
  )) as { url?: unknown };
  if (typeof body?.url !== "string") throw new AccountError("connection");
  return body.url;
}

export async function deleteAccount(token: string): Promise<void> {
  await accountRequest("/me", { method: "DELETE", headers: bearer(token) });
}

// Changes who the account is shown as, outside a room (inside one the chat connection does it). Answers with who they
// are now.
export async function updateAccountProfile(
  token: string,
  changes: ProfileChanges,
): Promise<AccountSession["profile"]> {
  const body = (await accountRequest("/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...bearer(token) },
    body: JSON.stringify(changes),
  })) as { profile?: unknown } | null;

  return parseAccountProfile(body?.profile);
}
