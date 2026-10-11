import { describe, expect, it } from "vitest";

import type { Room } from "./api";
import { groupRooms, roomTheme, roomVars, sortRooms } from "./roomThemes";

const room = (name: string, slug: string, id = 1): Room => ({
  id,
  name,
  slug,
  maxMembers: null,
});

const ROOMS = [
  room("Music", "music"),
  room("Gaming", "gaming"),
  room("Tech Talk", "tech-talk"),
  room("Random", "random"),
  room("General", "general"),
];

describe("sortRooms", () => {
  it("puts the open rooms first and sorts each group by name", () => {
    expect(sortRooms(ROOMS, "en").map((r) => r.name)).toEqual([
      "General",
      "Random",
      "Gaming",
      "Music",
      "Tech Talk",
    ]);
  });

  it("lists a room without a theme among the topics", () => {
    const sorted = sortRooms([...ROOMS, room("Lounge", "lounge")], "en");

    expect(sorted.map((r) => r.name)).toEqual([
      "General",
      "Random",
      "Gaming",
      "Lounge",
      "Music",
      "Tech Talk",
    ]);
  });

  it("does not change the list it is given", () => {
    const before = ROOMS.map((r) => r.name);
    sortRooms(ROOMS, "en");

    expect(ROOMS.map((r) => r.name)).toEqual(before);
  });
});

describe("groupRooms", () => {
  it("splits the rooms in their groups", () => {
    expect(
      groupRooms(ROOMS, "en").map((g) => [g.group, g.rooms.length]),
    ).toEqual([
      ["open", 2],
      ["topics", 3],
    ]);
  });

  it("leaves out a group without rooms", () => {
    expect(
      groupRooms([room("Music", "music")], "en").map((g) => g.group),
    ).toEqual(["topics"]);
  });
});

describe("roomTheme", () => {
  it("gives music, gaming and tech talk a colour each", () => {
    const accents = ["music", "gaming", "tech-talk"].map(
      (slug) => roomTheme(slug).accent,
    );

    expect(new Set(accents).size).toBe(3);
  });

  it("gives every known room an icon of its own", () => {
    const slugs = ["general", "random", "music", "gaming", "tech-talk"];

    expect(new Set(slugs.map((slug) => roomTheme(slug).icon)).size).toBe(5);
  });

  it("keeps general and random as the page's greys", () => {
    expect(roomTheme("general").tint).toBe(roomTheme("random").tint);
    expect(roomTheme("general").tint).toBe("var(--color-neutral-950)");
  });

  it("has no variables outside a room", () => {
    expect(roomVars(undefined)).toBeUndefined();
    expect(roomVars("music")).toMatchObject({ "--room-accent": "#e879f9" });
  });
});
