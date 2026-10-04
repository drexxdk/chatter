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
  // Seconds a guest must wait between messages; empty means only the general flood limit applies.
  slowModeSeconds: z.number().int().min(1).nullish(),
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
    const problems = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`);

    throw new Error(
      `Unexpected response from Payload (${path}): ${problems.join("; ")}`,
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
