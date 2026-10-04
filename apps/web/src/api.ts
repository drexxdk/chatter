import { CHAT_SERVER_URL } from "./config";

export interface Room {
  id: number;
  name: string;
  slug: string;
  // Absent or null means the room has no limit.
  maxMembers?: number | null;
  // Seconds a guest must wait between messages; absent only when talking to an older chat server.
  slowModeSeconds?: number | null;
  description?: string | null;
}

export async function fetchRooms(signal?: AbortSignal): Promise<Room[]> {
  const response = await fetch(`${CHAT_SERVER_URL}/rooms`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to load rooms: ${response.status}`);
  }

  return (await response.json()) as Room[];
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
]);

export async function signInModerator(
  email: string,
  password: string,
): Promise<ModeratorSession> {
  let response: Response;

  try {
    response = await fetch(`${CHAT_SERVER_URL}/moderator/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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
