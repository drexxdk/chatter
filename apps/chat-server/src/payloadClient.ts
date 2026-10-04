import { z } from "zod";

import { env } from "./env.js";

// Payload's API-key auth header format is "<collection-slug> API-Key <key>".
const AUTH_HEADER = `admins API-Key ${env.PAYLOAD_SERVICE_API_KEY}`;

// Only the listed fields are kept, so a field added to the collection later never reaches a public endpoint.
const publicRoomSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  // Empty in Payload means the room has no limit.
  maxMembers: z.number().int().min(1).nullish(),
  // Seconds a guest must wait between messages; a room that leaves it empty gets the server's default.
  slowModeSeconds: z
    .number()
    .int()
    .min(1)
    .nullish()
    .transform((seconds) => seconds ?? env.DEFAULT_SLOW_MODE_SECONDS),
  description: z.string().nullish(),
});

// An unreadable expiry used to count as already expired, which would silently lift the ban.
const banSchema = z.object({
  id: z.number(),
  identifierHash: z.string().min(1),
  reason: z.string().nullish(),
  expiresAt: z.iso.datetime({ offset: true }).nullish(),
});

export type PublicRoom = z.infer<typeof publicRoomSchema>;
export type Ban = z.infer<typeof banSchema>;

const describeIssues = (error: z.ZodError) =>
  error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

// A response that fails validation is rejected whole, so the caller keeps serving its last good copy.
// The message names the field only: ban hashes and reasons must not end up in logs.
async function payloadFetch<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.output<T>> {
  const res = await fetch(`${env.PAYLOAD_URL}${path}`, {
    headers: { Authorization: AUTH_HEADER },
  });

  if (!res.ok) {
    throw new Error(
      `Payload request failed: ${res.status} ${res.statusText} (${path})`,
    );
  }

  const result = schema.safeParse(await res.json());

  if (!result.success) {
    throw new Error(
      `Unexpected response from Payload (${path}): ${describeIssues(result.error)}`,
    );
  }

  return result.data;
}

export async function fetchPublicRooms(): Promise<PublicRoom[]> {
  const data = await payloadFetch(
    "/api/public-rooms?limit=100",
    z.object({ docs: z.array(publicRoomSchema) }),
  );
  return data.docs;
}

export async function fetchBans(): Promise<Ban[]> {
  const data = await payloadFetch(
    "/api/bans?limit=1000",
    z.object({ docs: z.array(banSchema) }),
  );
  return data.docs;
}

export interface Account {
  id: number;
  role: string;
  displayName: string | null;
}

// Payload checks the credentials itself (and locks an account after repeated failures). The service key is left
// out on purpose: the person's own password is what vouches for them. Undefined means "not accepted", whatever the
// reason, so a wrong email, a wrong password and a locked account look the same.
export async function loginAccount(
  email: string,
  password: string,
): Promise<Account | undefined> {
  const res = await fetch(`${env.PAYLOAD_URL}/api/admins/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 401 || res.status === 403) return undefined;

  if (!res.ok) {
    throw new Error(`Payload login failed: ${res.status} ${res.statusText}`);
  }

  const result = z
    .object({
      user: z.object({
        id: z.number(),
        role: z.string(),
        displayName: z.string().nullish(),
      }),
    })
    .safeParse(await res.json());

  if (!result.success) {
    throw new Error(
      `Unexpected response from Payload (login): ${describeIssues(result.error)}`,
    );
  }

  const { id, role, displayName } = result.data.user;
  return { id, role, displayName: displayName ?? null };
}

// The names of the accounts that can moderate, so guests cannot pick one of them.
export async function fetchModeratorNames(): Promise<string[]> {
  const data = await payloadFetch(
    "/api/admins?where[role][in]=moderator,super-admin&limit=100&depth=0",
    z.object({
      docs: z.array(z.object({ displayName: z.string().nullish() })),
    }),
  );

  return data.docs
    .map((doc) => doc.displayName)
    .filter((name): name is string => Boolean(name));
}
