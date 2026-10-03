import { env } from "./env.js";

// Payload's API-key auth header format is "<collection-slug> API-Key <key>".
const AUTH_HEADER = `admins API-Key ${env.PAYLOAD_SERVICE_API_KEY}`;

async function payloadFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${env.PAYLOAD_URL}${path}`, {
    headers: { Authorization: AUTH_HEADER },
  });

  if (!res.ok) {
    throw new Error(
      `Payload request failed: ${res.status} ${res.statusText} (${path})`,
    );
  }

  return (await res.json()) as T;
}

export interface PublicRoom {
  id: number;
  name: string;
  slug: string;
  // Empty in Payload means the room has no limit.
  maxMembers?: number | null;
  description?: string | null;
}

export async function fetchPublicRooms(): Promise<PublicRoom[]> {
  const data = await payloadFetch<{ docs: PublicRoom[] }>(
    "/api/public-rooms?limit=100",
  );
  return data.docs;
}

export interface Ban {
  id: number;
  identifierHash: string;
  reason?: string | null;
  expiresAt?: string | null;
}

export async function fetchBans(): Promise<Ban[]> {
  const data = await payloadFetch<{ docs: Ban[] }>("/api/bans?limit=1000");
  return data.docs;
}
