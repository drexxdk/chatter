import { describe, expect, it } from "vitest";

import type { Partner } from "./direct";
import { findMention, suggestMentions } from "./mentions";

describe("findMention", () => {
  it("finds an @ that begins the text", () => {
    expect(findMention("@", 1)).toEqual({ start: 0, query: "" });
    expect(findMention("@Bo", 3)).toEqual({ start: 0, query: "Bo" });
  });

  it("finds an @ after a space or a line break", () => {
    expect(findMention("hi @Bo", 6)).toEqual({ start: 3, query: "Bo" });
    expect(findMention("hi\n@Bo", 6)).toEqual({ start: 3, query: "Bo" });
    expect(findMention("hi\t@", 4)).toEqual({ start: 3, query: "" });
  });

  it("leaves an @ in the middle of a word alone, as in an email address", () => {
    expect(findMention("ann@", 4)).toBeNull();
    expect(findMention("write to ann@example.com", 24)).toBeNull();
    expect(findMention("ann@exa", 7)).toBeNull();
  });

  it("only looks at what is before the cursor", () => {
    expect(findMention("@Bob", 2)).toEqual({ start: 0, query: "B" });
    expect(findMention("hi @Bob", 2)).toBeNull();
  });

  it("uses the last @ before the cursor", () => {
    expect(findMention("@Bob and @Ca", 12)).toEqual({ start: 9, query: "Ca" });
    expect(findMention("a @@", 4)).toBeNull();
  });

  it("is over once the name has a line break in it, or starts with a space, or is longer than any name", () => {
    expect(findMention("@Bo\nb", 5)).toBeNull();
    expect(findMention("@ Bob", 5)).toBeNull();
    expect(findMention(`@${"x".repeat(25)}`, 26)).toBeNull();
    expect(findMention(`@${"x".repeat(24)}`, 25)).not.toBeNull();
  });

  it("keeps a name with a space in it going", () => {
    expect(findMention("@Anne Li", 8)).toEqual({ start: 0, query: "Anne Li" });
  });

  it("is nothing without an @", () => {
    expect(findMention("hello", 5)).toBeNull();
    expect(findMention("", 0)).toBeNull();
  });
});

describe("suggestMentions", () => {
  const person = (nickname: string): Partner => ({
    guestId: `g-${nickname}`,
    nickname,
    role: "guest",
    avatar: "other",
  });
  const names = (people: Partner[]) => people.map((p) => p.nickname);
  const room = ["Bob", "Rob", "Alice", "Anne Linde", "Bobby", "Carol"].map(
    person,
  );

  it("offers everybody for a bare @, in the order of the room", () => {
    expect(names(suggestMentions(room, ""))).toEqual([
      "Bob",
      "Rob",
      "Alice",
      "Anne Linde",
      "Bobby",
      "Carol",
    ]);
  });

  it("puts the names that begin with the query before the ones that only have it inside", () => {
    expect(names(suggestMentions(room, "b"))).toEqual(["Bob", "Bobby", "Rob"]);
  });

  it("ignores case", () => {
    expect(names(suggestMentions(room, "CAR"))).toEqual(["Carol"]);
  });

  it("follows a name with a space", () => {
    expect(names(suggestMentions(room, "Anne L"))).toEqual(["Anne Linde"]);
  });

  it("offers nobody for a name already written in full and followed by a space", () => {
    expect(suggestMentions(room, "Bob ")).toEqual([]);
  });

  it("offers nobody when nothing matches", () => {
    expect(suggestMentions(room, "zzz")).toEqual([]);
  });

  it("offers no more than eight", () => {
    const many = Array.from({ length: 20 }, (_, i) => person(`User ${i}`));

    expect(suggestMentions(many, "")).toHaveLength(8);
  });
});
