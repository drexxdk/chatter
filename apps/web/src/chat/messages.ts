import { parseAvatar } from "./avatar";
import { parseReactions, sameReactions } from "./reactions";
import type { Announcement, ChatMessage } from "./types";

export const MAX_MESSAGES = 200;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function placeholderFor(message: {
  id: string;
  roomSlug: string;
  sentAt: string;
}): ChatMessage {
  return {
    id: message.id,
    roomSlug: message.roomSlug,
    sentAt: message.sentAt,
    guestId: "",
    nickname: "",
    text: "",
    banned: true,
  };
}

// A message as the server sends it: either a full message or, once its author was banned, a bare placeholder.
export function parseMessage(value: unknown): ChatMessage | undefined {
  if (!isRecord(value)) return undefined;
  const { id, roomSlug, sentAt } = value;

  if (
    typeof id !== "string" ||
    typeof roomSlug !== "string" ||
    typeof sentAt !== "string"
  ) {
    return undefined;
  }

  if (value.banned === true) return placeholderFor({ id, roomSlug, sentAt });

  const { guestId, nickname, text } = value;

  if (
    typeof guestId !== "string" ||
    typeof nickname !== "string" ||
    typeof text !== "string"
  ) {
    return undefined;
  }

  const reactions = parseReactions(value.reactions);

  return {
    id,
    roomSlug,
    guestId,
    nickname,
    text,
    sentAt,
    role: value.role === "moderator" ? "moderator" : "guest",
    avatar: parseAvatar(value.avatar),
    ...(reactions.length > 0 ? { reactions } : {}),
  };
}

export function parseAnnouncement(value: unknown): Announcement | undefined {
  if (!isRecord(value)) return undefined;
  const { id, text, sentAt, name } = value;

  if (
    typeof id !== "string" ||
    typeof text !== "string" ||
    typeof sentAt !== "string" ||
    typeof name !== "string"
  ) {
    return undefined;
  }

  return { id, text, sentAt, name };
}

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0;

// The server's remembered messages for the room, merged into what is already on screen. The same message can arrive
// both live and in the history, so ids decide what is new; timestamps keep the whole list in the order it was sent.
// A placeholder in the history wins over a copy that was delivered live: it is the newer news.
export function mergeHistory(
  existing: ChatMessage[],
  history: unknown,
  roomSlug: string,
): ChatMessage[] {
  if (!Array.isArray(history)) return existing;

  const byId = new Map(existing.map((message) => [message.id, message]));
  let changed = false;

  for (const entry of history) {
    const message = parseMessage(entry);
    if (!message || message.roomSlug !== roomSlug) continue;

    const current = byId.get(message.id);

    if (!current || (message.banned && !current.banned)) {
      byId.set(message.id, message);
      changed = true;
    } else if (
      !current.banned &&
      !message.banned &&
      !sameReactions(current.reactions, message.reactions)
    ) {
      // The history is the newer news about who reacted.
      byId.set(message.id, { ...current, reactions: message.reactions });
      changed = true;
    }
  }

  if (!changed) return existing;

  return [...byId.values()].sort(byTime).slice(-MAX_MESSAGES);
}

export function strings(value: unknown): Set<string> {
  return new Set(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  );
}

// The server banned someone: their messages, named by id or by the guest they were sent as, turn into placeholders.
export function applyRedaction(
  existing: ChatMessage[],
  notice: unknown,
  roomSlug: string | null,
): ChatMessage[] {
  if (!isRecord(notice) || notice.roomSlug !== roomSlug) return existing;

  const ids = strings(notice.ids);
  const guestIds = strings(notice.guestIds);
  guestIds.delete("");

  if (ids.size === 0 && guestIds.size === 0) return existing;

  return existing.map((message) =>
    !message.banned &&
    message.roomSlug === roomSlug &&
    (ids.has(message.id) || guestIds.has(message.guestId))
      ? placeholderFor(message)
      : message,
  );
}
