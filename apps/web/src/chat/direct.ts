import type { Avatar } from "./avatar";
import { parseAvatar } from "./avatar";
import type { Role } from "./useChat";

// A message as the server sends it; once its author was banned the text is gone and only a placeholder is shown.
export interface DirectMessage {
  id: string;
  fromGuestId: string;
  fromNickname: string;
  fromRole: Role;
  fromAvatar: Avatar;
  toGuestId: string;
  toNickname: string;
  toAvatar: Avatar;
  text: string;
  sentAt: string;
  banned?: boolean;
}

// Something that happened to one of the two, shown in the conversation where it happened. `self` is the guest
// themselves, so both sides of a conversation can read the same history.
export interface DirectStatus {
  kind: "status";
  id: string;
  event: "left" | "rejoined";
  sentAt: string;
  self?: true;
}

export type DirectEntry = DirectMessage | DirectStatus;

export const isStatus = (entry: DirectEntry): entry is DirectStatus =>
  "kind" in entry && entry.kind === "status";

export interface Partner {
  guestId: string;
  nickname: string;
  role: Role;
  avatar: Avatar;
}

export interface DirectThread extends Partner {
  entries: DirectEntry[];
  unread: number;
  // Whether they are in the guest's room right now, to notice when that changes.
  present: boolean;
}

const MAX_ENTRIES_PER_THREAD = 200;
const MAX_THREADS = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseDirectMessage(value: unknown): DirectMessage | undefined {
  if (!isRecord(value)) return undefined;

  const { id, fromGuestId, fromNickname, toGuestId, toNickname, text, sentAt } =
    value;

  if (
    typeof id !== "string" ||
    typeof fromGuestId !== "string" ||
    typeof fromNickname !== "string" ||
    typeof toGuestId !== "string" ||
    typeof toNickname !== "string" ||
    typeof text !== "string" ||
    typeof sentAt !== "string"
  ) {
    return undefined;
  }

  return {
    id,
    fromGuestId,
    fromNickname,
    fromRole: value.fromRole === "moderator" ? "moderator" : "guest",
    fromAvatar: parseAvatar(value.fromAvatar),
    toGuestId,
    toNickname,
    toAvatar: parseAvatar(value.toAvatar),
    text,
    sentAt,
  };
}

// The conversation with this partner gets the message and moves to the top, so the list is in order of activity.
export function addDirectMessage(
  threads: DirectThread[],
  partner: Partner,
  message: DirectMessage,
  unread: boolean,
): DirectThread[] {
  const existing = threads.find((thread) => thread.guestId === partner.guestId);

  if (existing?.entries.some((known) => known.id === message.id)) {
    return threads;
  }

  const updated: DirectThread = {
    ...partner,
    entries: [...(existing?.entries ?? []), message].slice(
      -MAX_ENTRIES_PER_THREAD,
    ),
    unread: (existing?.unread ?? 0) + (unread ? 1 : 0),
    // They just wrote, or were just written to, so they are here.
    present: true,
  };

  return [
    updated,
    ...threads.filter((thread) => thread.guestId !== partner.guestId),
  ].slice(0, MAX_THREADS);
}

export function markRead(
  threads: DirectThread[],
  guestId: string,
): DirectThread[] {
  return threads.some((thread) => thread.guestId === guestId && thread.unread)
    ? threads.map((thread) =>
        thread.guestId === guestId ? { ...thread, unread: 0 } : thread,
      )
    : threads;
}

// The room's people changed. A conversation whose other person left, or came back, says so where it is read. With
// `silent` the list is only noted: it is a different room's, so nobody left.
export function applyPresence(
  threads: DirectThread[],
  presentIds: Set<string>,
  now: string,
  silent: boolean,
  newId: () => string,
): DirectThread[] {
  let changed = false;

  const next = threads.map((thread) => {
    const present = presentIds.has(thread.guestId);

    if (present === thread.present) return thread;

    changed = true;

    if (silent) return { ...thread, present };

    const status: DirectStatus = {
      kind: "status",
      id: newId(),
      event: present ? "rejoined" : "left",
      sentAt: now,
    };

    return {
      ...thread,
      present,
      entries: [...thread.entries, status].slice(-MAX_ENTRIES_PER_THREAD),
    };
  });

  return changed ? next : threads;
}

// The guest's own connection ended and came back as the same guest (a reload or a dropped connection). The other
// person was told they left and returned, so the conversation says it here too.
export function markReturned(
  threads: DirectThread[],
  now: string,
  newId: () => string,
): DirectThread[] {
  return threads.map((thread) => {
    const statuses: DirectStatus[] = (["left", "rejoined"] as const).map(
      (event) => ({
        kind: "status",
        id: newId(),
        event,
        sentAt: now,
        self: true,
      }),
    );

    return {
      ...thread,
      entries: [...thread.entries, ...statuses].slice(-MAX_ENTRIES_PER_THREAD),
    };
  });
}

// Somebody was banned: what they wrote to the guest turns into a placeholder. What the guest wrote stays.
export function redactDirect(
  threads: DirectThread[],
  notice: unknown,
): DirectThread[] {
  if (!isRecord(notice) || !Array.isArray(notice.guestIds)) return threads;

  const banned = new Set(
    notice.guestIds.filter(
      (id): id is string => typeof id === "string" && id !== "",
    ),
  );

  if (banned.size === 0) return threads;

  const isBannedAuthor = (entry: DirectEntry) =>
    !isStatus(entry) && !entry.banned && banned.has(entry.fromGuestId);

  return threads.map((thread) =>
    thread.entries.some(isBannedAuthor)
      ? {
          ...thread,
          entries: thread.entries.map((entry) =>
            isBannedAuthor(entry)
              ? { ...(entry as DirectMessage), text: "", banned: true }
              : entry,
          ),
        }
      : thread,
  );
}

function parseEntry(value: unknown): DirectEntry | undefined {
  if (!isRecord(value)) return undefined;

  if (value.kind === "status") {
    const { id, event, sentAt } = value;

    return typeof id === "string" &&
      typeof sentAt === "string" &&
      (event === "left" || event === "rejoined")
      ? {
          kind: "status",
          id,
          event,
          sentAt,
          ...(value.self === true ? { self: true as const } : {}),
        }
      : undefined;
  }

  const message = parseDirectMessage(value);

  // A message that was replaced after a ban stays replaced.
  return message && value.banned === true
    ? { ...message, text: "", banned: true }
    : message;
}

// Conversations kept in the tab to survive a reload. Whatever is not in the shape this expects is left out: stored
// text is not to be trusted any more than text from the network.
export function parseThreads(value: unknown): DirectThread[] {
  if (!Array.isArray(value)) return [];

  const threads: DirectThread[] = [];

  for (const raw of value) {
    if (!isRecord(raw)) continue;

    const { guestId, nickname, entries, unread, present } = raw;

    if (
      typeof guestId !== "string" ||
      !guestId ||
      typeof nickname !== "string" ||
      !Array.isArray(entries)
    ) {
      continue;
    }

    threads.push({
      guestId,
      nickname,
      role: raw.role === "moderator" ? "moderator" : "guest",
      avatar: parseAvatar(raw.avatar),
      entries: entries
        .flatMap((entry) => {
          const parsed = parseEntry(entry);
          return parsed ? [parsed] : [];
        })
        .slice(-MAX_ENTRIES_PER_THREAD),
      unread: typeof unread === "number" && unread > 0 ? Math.floor(unread) : 0,
      present: typeof present === "boolean" ? present : true,
    });
  }

  return threads.slice(0, MAX_THREADS);
}
