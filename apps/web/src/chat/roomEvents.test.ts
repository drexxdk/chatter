import { describe, expect, it } from "vitest";

import { movements, timeline, type RoomEvent } from "./roomEvents";
import type { ChatMessage, Member } from "./useChat";

const me: Member = { guestId: "me", nickname: "Alice" };
const bob: Member = { guestId: "bob", nickname: "Bob" };
const carol: Member = { guestId: "carol", nickname: "Carol" };

function changes(
  previous: Member[],
  next: Member[],
  self: string | null = "me",
) {
  let seq = 0;
  let id = 0;

  return movements(
    previous,
    next,
    self,
    "general",
    "2026-10-04T12:00:00.000Z",
    () => ++seq,
    () => `event-${++id}`,
  );
}

describe("movements", () => {
  it("names who came", () => {
    expect(changes([me], [me, bob])).toEqual([
      {
        id: "event-1",
        roomSlug: "general",
        event: "joined",
        guestId: "bob",
        nickname: "Bob",
        sentAt: "2026-10-04T12:00:00.000Z",
        seq: 1,
      },
    ]);
  });

  it("names who went, by the name they had", () => {
    expect(changes([me, bob], [me])).toMatchObject([
      { event: "left", nickname: "Bob" },
    ]);
  });

  it("puts those who left before those who came, each with the next number", () => {
    expect(changes([me, bob], [me, carol])).toMatchObject([
      { event: "left", nickname: "Bob", seq: 1 },
      { event: "joined", nickname: "Carol", seq: 2 },
    ]);
  });

  it("says nothing when the people are the same, in whatever order", () => {
    expect(changes([me, bob], [bob, me])).toEqual([]);
  });

  it("leaves the guest out, coming or going", () => {
    expect(changes([bob], [bob, me])).toEqual([]);
    expect(changes([me, bob], [bob])).toEqual([]);
  });

  it("announces everybody when it does not know who the guest is", () => {
    expect(changes([], [me], null)).toMatchObject([{ nickname: "Alice" }]);
  });
});

const event = (seq: number): RoomEvent => ({
  id: `event-${seq}`,
  roomSlug: "general",
  event: "joined",
  guestId: "bob",
  nickname: "Bob",
  sentAt: "2026-10-04T12:00:00.000Z",
  seq,
});

const said = (id: string, seq?: number): ChatMessage => ({
  id,
  roomSlug: "general",
  guestId: "bob",
  nickname: "Bob",
  text: id,
  sentAt: "2026-10-04T12:00:00.000Z",
  ...(seq === undefined ? {} : { seq }),
});

const names = (items: ReturnType<typeof timeline>) =>
  items.map((item) =>
    item.kind === "event" ? item.event.id : item.message.id,
  );

describe("timeline", () => {
  it("is just the messages when nothing happened", () => {
    expect(names(timeline([said("a"), said("b", 1)], []))).toEqual(["a", "b"]);
  });

  it("puts an event before the first message that came after it", () => {
    expect(names(timeline([said("a", 1), said("b", 3)], [event(2)]))).toEqual([
      "a",
      "event-2",
      "b",
    ]);
  });

  it("puts events that came before every live message after the history", () => {
    expect(names(timeline([said("old"), said("new", 2)], [event(1)]))).toEqual([
      "old",
      "event-1",
      "new",
    ]);
  });

  it("puts events that came after every message at the end", () => {
    expect(names(timeline([said("a", 1)], [event(2), event(3)]))).toEqual([
      "a",
      "event-2",
      "event-3",
    ]);
  });

  it("keeps several events in the order they came", () => {
    expect(
      names(
        timeline([said("a", 1), said("b", 5)], [event(2), event(3), event(4)]),
      ),
    ).toEqual(["a", "event-2", "event-3", "event-4", "b"]);
  });

  it("shows only events when there are no messages", () => {
    expect(names(timeline([], [event(1), event(2)]))).toEqual([
      "event-1",
      "event-2",
    ]);
  });

  it("does not let a message without a place pull events in front of it", () => {
    expect(names(timeline([said("a", 1), said("late")], [event(2)]))).toEqual([
      "a",
      "late",
      "event-2",
    ]);
  });
});
