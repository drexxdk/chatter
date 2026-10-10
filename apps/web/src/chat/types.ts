import type { Avatar } from "./avatar";
import type { DirectThread } from "./direct";
import type { Reaction } from "./reactions";
import type { Resume } from "./socket";

export type Role = "guest" | "moderator";

export interface Session {
  guestId: string;
  nickname: string;
  role?: Role;
  avatar?: Avatar;
  // Only when the guest said how old they are.
  age?: number;
  resumeSecret?: string;
}

export interface Member {
  guestId: string;
  nickname: string;
  role?: Role;
  avatar?: Avatar;
  age?: number;
}

export interface ChatMessage {
  id: string;
  roomSlug: string;
  guestId: string;
  nickname: string;
  text: string;
  sentAt: string;
  // Who the server says sent it; absent means an ordinary guest.
  role?: Role;
  avatar?: Avatar;
  // Who reacted with what; absent while nobody has.
  reactions?: Reaction[];
  // The guest's place in what arrived live (see roomEvents.ts); not sent by the server.
  seq?: number;
  // The author was banned: the text and name are gone and only a placeholder is shown.
  banned?: boolean;
}

export type ChatStatus = "idle" | "connecting" | "connected" | "reconnecting";

export interface ConnectOptions {
  // A moderator's signed token, in place of a nickname.
  token?: string;
  avatar?: Avatar;
  age?: number;
  // The ids this guest had on earlier connections (before a reload), so what they wrote is still theirs.
  previousGuestIds?: string[];
  // The identity to take over, when this is the same guest on a new page load.
  resume?: Resume;
  // What the guest had open before a reload.
  threads?: DirectThread[];
  blockedIds?: string[];
  // The conversation that was open, to be open again if that person is still in the room.
  openGuestId?: string;
}

// What a moderator told everyone.
export interface Announcement {
  id: string;
  text: string;
  sentAt: string;
  name: string;
}

export type ActionResult =
  { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };
export type AnnounceResult = ActionResult;

export type Ack =
  | { ok: true; history?: unknown; profile?: unknown }
  | { ok: false; error: string; retryAfterMs?: number };

export function toResult(ack: Ack): ActionResult {
  if (ack.ok) return { ok: true };

  return {
    ok: false,
    error: ack.error,
    retryAfterSeconds: ack.retryAfterMs
      ? Math.ceil(ack.retryAfterMs / 1000)
      : undefined,
  };
}
