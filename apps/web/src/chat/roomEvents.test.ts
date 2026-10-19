import { describe, expect, it } from "vitest";

import {
  directItems,
  eventsFromHistory,
  mergeEvents,
  parseRoomEvent,
  timeline,
  withDirect,
  type RoomEvent,
} from "./roomEvents";
import type { ChatMessage } from "./types";
import type { DirectMessage, DirectThread } from "./direct";

const told = (extra: Record<string, unknown> = {}) => ({
  id: "event-1",
  roomSlug: "general",
  event: "joined",
  guestId: "bob",
  nickname: "Bob",
  sentAt: "2026-10-04T12:00:00.000Z",
  ...extra,
});

describe("parseRoomEvent", () => {
  it("reads what the server sends, without a place among the live messages", () => {
    expect(parseRoomEvent(told())).toEqual(told());
    expect(parseRoomEvent(told({ event: "left" }))).toMatchObject({
      event: "left",
    });
  });

  it("leaves out what the server did not send", () => {
    expect(parseRoomEvent(told({ ipHash: "secret", seq: 7 }))).toEqual(told());
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a string", "joined"],
    ["another event", told({ event: "danced" })],
    ["no id", told({ id: undefined })],
    ["no room", told({ roomSlug: 1 })],
    ["no guest", told({ guestId: undefined })],
    ["no name", told({ nickname: null })],
    ["no time", told({ sentAt: undefined })],
  ])("refuses %s", (_label, value) => {
    expect(parseRoomEvent(value)).toBeUndefined();
  });
});

describe("eventsFromHistory", () => {
  it("picks the movements out of the messages, for this room", () => {
    const history = [
      { ...said("a"), roomSlug: "general" },
      told({ id: "x" }),
      told({ id: "y", roomSlug: "music" }),
      "junk",
    ];

    expect(eventsFromHistory(history, "general").map((e) => e.id)).toEqual([
      "x",
    ]);
  });

  it("is nothing when there is no history", () => {
    expect(eventsFromHistory(undefined, "general")).toEqual([]);
    expect(eventsFromHistory("no", "general")).toEqual([]);
  });
});

describe("mergeEvents", () => {
  const one = (id: string, extra: Partial<RoomEvent> = {}): RoomEvent => ({
    ...(told({ id }) as RoomEvent),
    ...extra,
  });

  it("adds each event once, keeping the first that came", () => {
    const first = one("a", { seq: 1 });

    const merged = mergeEvents([first], [one("a"), one("b", { seq: 2 })]);

    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
    expect(merged[0]).toBe(first);
  });

  it("is the same list when nothing is new", () => {
    const existing = [one("a", { seq: 1 })];

    expect(mergeEvents(existing, [one("a")])).toBe(existing);
  });

  it("puts the history's by the time they happened, ahead of the live ones", () => {
    const merged = mergeEvents(
      [one("live", { seq: 1 })],
      [
        one("late", { sentAt: "2026-10-04T12:00:09.000Z" }),
        one("early", { sentAt: "2026-10-04T12:00:01.000Z" }),
      ],
    );

    expect(merged.map((e) => e.id)).toEqual(["early", "late", "live"]);
  });

  it("keeps the live ones in the order they came", () => {
    const merged = mergeEvents(
      [one("b", { seq: 2 })],
      [one("a", { seq: 1 }), one("c", { seq: 3 })],
    );

    expect(merged.map((e) => e.id)).toEqual(["a", "b", "c"]);
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
    item.kind === "event"
      ? item.event.id
      : item.kind === "announcement"
        ? item.announcement.id
        : item.kind === "notice"
          ? item.status.id
          : item.message.id,
  );

describe("shared private timeline items", () => {
  const message: DirectMessage = {
    id: "private",
    fromGuestId: "bob",
    fromNickname: "Bob",
    fromRole: "guest",
    fromAvatar: "male",
    fromPicture: "lorelei:abc12345",
    toGuestId: "alice",
    toNickname: "Alice",
    toAvatar: "other",
    text: "Hello",
    sentAt: "2026-10-04T12:00:02.000Z",
  };
  const thread: DirectThread = {
    guestId: "bob",
    nickname: "Robert",
    role: "moderator",
    avatar: "female",
    entries: [message],
    present: true,
    unread: 0,
  };

  it("uses current partner metadata without changing historical message snapshots", () => {
    expect(directItems([thread])).toEqual([
      {
        kind: "direct",
        message,
        partner: {
          guestId: "bob",
          nickname: "Robert",
          role: "moderator",
          avatar: "female",
        },
      },
    ]);
    expect(message.fromNickname).toBe("Bob");
    expect(message.fromPicture).toBe("lorelei:abc12345");
    expect(
      directItems([{ ...thread, picture: "thumbs:zzzz9999" }])[0],
    ).toMatchObject({ partner: { picture: "thumbs:zzzz9999" } });
  });

  it("retains ban placeholders and block notices but not conversation-only movements", () => {
    const entries: DirectThread["entries"] = [
      { ...message, banned: true },
      ...(["left", "rejoined", "blockedYou", "unblockedYou"] as const).map(
        (event) => ({
          kind: "status" as const,
          id: event,
          event,
          sentAt: message.sentAt,
        }),
      ),
    ];
    const items = directItems([{ ...thread, entries }]);
    expect(names(items)).toEqual(["private", "blockedYou", "unblockedYou"]);
    expect(items[0]).toMatchObject({
      kind: "direct",
      message: { banned: true },
    });
    expect(items[1]).toMatchObject({
      kind: "notice",
      partner: { nickname: "Robert" },
    });
  });

  it("inserts shared private items chronologically without reordering the stored entries", () => {
    const entries = [
      { ...message, id: "later", sentAt: "2026-10-04T12:00:04.000Z" },
      message,
    ];
    const publicItems = timeline(
      [
        { ...said("before"), sentAt: "2026-10-04T12:00:01.000Z" },
        { ...said("after"), sentAt: "2026-10-04T12:00:03.000Z" },
      ],
      [],
    );
    expect(names(withDirect(publicItems, [{ ...thread, entries }]))).toEqual([
      "before",
      "private",
      "after",
      "later",
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(["later", "private"]);
    expect(names(publicItems)).toEqual(["before", "after"]);
    expect(withDirect(publicItems, [])).toBe(publicItems);
  });
});

describe("timeline", () => {
  const earlier = (id: string, second: number): RoomEvent => {
    const { seq: _seq, ...rest } = event(0);

    return {
      ...rest,
      id,
      sentAt: `2026-10-04T12:00:0${second}.000Z`,
    };
  };
  const old = (id: string, second: number): ChatMessage => ({
    ...said(id),
    sentAt: `2026-10-04T12:00:0${second}.000Z`,
  });

  it("keeps announcements between the messages sent before and after them", () => {
    expect(
      names(
        timeline(
          [old("before", 1), old("after", 3)],
          [],
          [
            {
              id: "announcement",
              text: "Notice",
              name: "Ada Mod",
              sentAt: "2026-10-04T12:00:02.000Z",
            },
          ],
        ),
      ),
    ).toEqual(["before", "announcement", "after"]);
  });

  it("sets the history's events among the history's messages by their time", () => {
    expect(
      names(
        timeline(
          [old("a", 1), old("b", 3), old("c", 5)],
          [earlier("x", 0), earlier("y", 2), earlier("z", 4), earlier("w", 6)],
        ),
      ),
    ).toEqual(["x", "a", "y", "b", "z", "c", "w"]);
  });

  it("puts the history's events before the live messages and the live events", () => {
    expect(
      names(
        timeline([old("a", 1), said("live", 5)], [event(2), earlier("x", 8)]),
      ),
    ).toEqual(["a", "x", "event-2", "live"]);
  });

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
