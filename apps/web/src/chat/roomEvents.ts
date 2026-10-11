import {
  isStatus,
  type DirectMessage,
  type DirectStatus,
  type DirectThread,
  type Partner,
} from "./direct";
import { isRecord } from "../isRecord";
import type { ChatMessage } from "./types";

// Somebody came into the room or went out of it, as the server told. `seq` says where it fell among the messages that
// arrived live, which the clocks of different computers could not; what came with the history has none, and is set
// among the messages by the time it happened.
export interface RoomEvent {
  id: string;
  roomSlug: string;
  event: "joined" | "left";
  guestId: string;
  nickname: string;
  sentAt: string;
  seq?: number;
}
export type TimelineItem =
  | { kind: "message"; message: ChatMessage }
  | { kind: "event"; event: RoomEvent }
  | { kind: "direct"; message: DirectMessage; partner: Partner }
  // Somebody blocked the guest or took it back, which the room's timeline says as well as the conversation.
  | { kind: "notice"; status: DirectStatus; partner: Partner };

// A line of the room's history, or a live message from the server, about somebody coming or going.
export function parseRoomEvent(value: unknown): RoomEvent | undefined {
  if (!isRecord(value)) return undefined;
  const { id, roomSlug, event, guestId, nickname, sentAt } = value;

  if (
    typeof id !== "string" ||
    typeof roomSlug !== "string" ||
    (event !== "joined" && event !== "left") ||
    typeof guestId !== "string" ||
    typeof nickname !== "string" ||
    typeof sentAt !== "string"
  ) {
    return undefined;
  }

  return { id, roomSlug, event, guestId, nickname, sentAt };
}

// What the room's history says about who came and went in this room, apart from the messages.
export function eventsFromHistory(
  history: unknown,
  roomSlug: string,
): RoomEvent[] {
  if (!Array.isArray(history)) return [];

  return history.flatMap((entry) => {
    const event = parseRoomEvent(entry);

    return event && event.roomSlug === roomSlug ? [event] : [];
  });
}

// The events known so far with new ones added, each once: the same one can arrive live and in the history. What came
// with the history goes first, by the time it happened, and then what came live in the order it did.
export function mergeEvents(
  existing: RoomEvent[],
  added: RoomEvent[],
): RoomEvent[] {
  const known = new Set(existing.map((event) => event.id));
  const fresh = added.filter((event) => !known.has(event.id));
  if (fresh.length === 0) return existing;

  const all = [...existing, ...fresh];

  return [
    ...all
      .filter((event) => event.seq === undefined)
      .sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0)),
    ...all
      .filter((event) => event.seq !== undefined)
      .sort((a, b) => a.seq! - b.seq!),
  ];
}

// The messages with the events set between them where they happened. Messages from the history carry no `seq` and
// come before anything that happened since; they and the history's events are put in the order of the time they were
// sent.
export function timeline(
  messages: ChatMessage[],
  events: RoomEvent[],
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const earlier = events.filter((event) => event.seq === undefined);
  const live = events.filter((event) => event.seq !== undefined);
  let nextEarlier = 0;
  let nextLive = 0;

  const flushEarlier = (until?: string) => {
    for (
      let event = earlier[nextEarlier];
      event && (until === undefined || event.sentAt <= until);
      event = earlier[nextEarlier]
    ) {
      items.push({ kind: "event", event });
      nextEarlier++;
    }
  };

  for (const message of messages) {
    if (message.seq === undefined) {
      flushEarlier(message.sentAt);
    } else {
      flushEarlier();

      for (
        let event = live[nextLive];
        event && event.seq! < message.seq;
        event = live[nextLive]
      ) {
        items.push({ kind: "event", event });
        nextLive++;
      }
    }

    items.push({ kind: "message", message });
  }

  flushEarlier();

  for (const event of live.slice(nextLive)) {
    items.push({ kind: "event", event });
  }

  return items;
}
const timeOf = (item: TimelineItem) =>
  Date.parse(
    item.kind === "event"
      ? item.event.sentAt
      : item.kind === "notice"
        ? item.status.sentAt
        : item.message.sentAt,
  );

// The guest's private messages, sent and received, set into the room's timeline by the time they were sent.
export function withDirect(
  items: TimelineItem[],
  threads: DirectThread[],
): TimelineItem[] {
  const direct: TimelineItem[] = threads
    .flatMap((thread) => {
      const partner = {
        guestId: thread.guestId,
        nickname: thread.nickname,
        role: thread.role,
        avatar: thread.avatar,
      };

      return thread.entries.flatMap((entry): TimelineItem[] =>
        !isStatus(entry)
          ? [{ kind: "direct", message: entry, partner }]
          : entry.event === "blockedYou" || entry.event === "unblockedYou"
            ? [{ kind: "notice", status: entry, partner }]
            : [],
      );
    })
    .sort((a, b) => timeOf(a) - timeOf(b));

  if (direct.length === 0) return items;

  const result = [...items];

  for (const item of direct) {
    let index = result.length;
    for (
      let before = result[index - 1];
      before && timeOf(before) > timeOf(item);
      before = result[index - 1]
    ) {
      index--;
    }
    result.splice(index, 0, item);
  }

  return result;
}
