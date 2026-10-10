import {
  isStatus,
  type DirectMessage,
  type DirectStatus,
  type DirectThread,
  type Partner,
} from "./direct";
import type { ChatMessage, Member } from "./types";

// Somebody came into the room or went out of it, as far as this client noticed. `seq` says where it fell among the
// messages that arrived live, which the clocks of different computers could not.
export interface RoomEvent {
  id: string;
  roomSlug: string;
  event: "joined" | "left";
  guestId: string;
  nickname: string;
  sentAt: string;
  seq: number;
}

export type TimelineItem =
  | { kind: "message"; message: ChatMessage }
  | { kind: "event"; event: RoomEvent }
  | { kind: "direct"; message: DirectMessage; partner: Partner }
  // Somebody blocked the guest or took it back, which the room's timeline says as well as the conversation.
  | { kind: "notice"; status: DirectStatus; partner: Partner };

// Who left and who came, comparing two lists of the room's people. The guest themselves is not announced to themselves.
export function movements(
  previous: Member[],
  next: Member[],
  selfGuestId: string | null,
  roomSlug: string,
  now: string,
  nextSeq: () => number,
  newId: () => string,
): RoomEvent[] {
  const before = new Set(previous.map((member) => member.guestId));
  const after = new Set(next.map((member) => member.guestId));
  const event = (kind: RoomEvent["event"], member: Member): RoomEvent => ({
    id: newId(),
    roomSlug,
    event: kind,
    guestId: member.guestId,
    nickname: member.nickname,
    sentAt: now,
    seq: nextSeq(),
  });

  return [
    ...previous
      .filter(
        (member) =>
          member.guestId !== selfGuestId && !after.has(member.guestId),
      )
      .map((member) => event("left", member)),
    ...next
      .filter(
        (member) =>
          member.guestId !== selfGuestId && !before.has(member.guestId),
      )
      .map((member) => event("joined", member)),
  ];
}

// The messages with the events set between them where they happened. Messages from the history carry no `seq` and
// come before anything that happened since.
export function timeline(
  messages: ChatMessage[],
  events: RoomEvent[],
): TimelineItem[] {
  const items: TimelineItem[] = [];
  let next = 0;

  for (const message of messages) {
    if (message.seq !== undefined) {
      for (
        let event = events[next];
        event && event.seq < message.seq;
        event = events[next]
      ) {
        items.push({ kind: "event", event });
        next++;
      }
    }

    items.push({ kind: "message", message });
  }

  for (const event of events.slice(next)) {
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
