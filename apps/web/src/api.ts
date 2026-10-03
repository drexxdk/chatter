import { CHAT_SERVER_URL } from "./config";

export interface Room {
  id: number;
  name: string;
  slug: string;
  // Absent or null means the room has no limit.
  maxMembers?: number | null;
  description?: string | null;
}

export async function fetchRooms(signal?: AbortSignal): Promise<Room[]> {
  const response = await fetch(`${CHAT_SERVER_URL}/rooms`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to load rooms: ${response.status}`);
  }

  return (await response.json()) as Room[];
}
