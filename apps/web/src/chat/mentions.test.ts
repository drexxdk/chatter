import { describe, expect, it } from "vitest";

import type { Partner } from "./direct";
import { splitMentions, suggestMentions } from "./mentions";
import type { Member } from "./types";

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

describe("splitMentions", () => {
  const member = (nickname: string): Member => ({
    guestId: `g-${nickname}`,
    nickname,
  });
  const room = ["Bob", "Bobby", "Anne", "Anne Linde", "Carol"].map(member);
  // Plain words as they are, a mention as `[name]`.
  const shown = (text: string) =>
    splitMentions(text, room).map((piece) =>
      typeof piece === "string" ? piece : `[${piece.mention.nickname}]`,
    );

  it("is the text itself when there is no mention", () => {
    expect(splitMentions("hello there", room)).toEqual(["hello there"]);
    expect(splitMentions("", room)).toEqual([]);
  });

  it("sets apart the name of somebody in the room", () => {
    expect(shown("hi @Carol, how are you")).toEqual([
      "hi ",
      "[Carol]",
      ", how are you",
    ]);
  });

  it("takes the @ with the name, as it was written", () => {
    const [, mention] = splitMentions("hi @carol", room);

    expect(mention).toEqual({
      mention: expect.objectContaining({ nickname: "Carol" }),
      text: "@carol",
    });
  });

  it("finds a mention at the start and at the end", () => {
    expect(shown("@Bob")).toEqual(["[Bob]"]);
    expect(shown("@Bob @Carol")).toEqual(["[Bob]", " ", "[Carol]"]);
  });

  it("takes the longest name that fits, with a space in it", () => {
    expect(shown("@Anne Linde came")).toEqual(["[Anne Linde]", " came"]);
    expect(shown("@Anne came")).toEqual(["[Anne]", " came"]);
  });

  it("does not stop in the middle of a longer name", () => {
    expect(shown("@Bobby")).toEqual(["[Bobby]"]);
    expect(shown("@Bobcat")).toEqual(["@Bobcat"]);
  });

  it("ends at punctuation", () => {
    expect(shown("thanks @Bob.")).toEqual(["thanks ", "[Bob]", "."]);
    expect(shown("(@Bob)")).toEqual(["(@Bob)"]);
  });

  it("leaves an @ in the middle of a word alone", () => {
    expect(shown("mail bob@Bob.dk")).toEqual(["mail bob@Bob.dk"]);
  });

  it("leaves the name of somebody who is not here alone", () => {
    expect(shown("hi @Zed")).toEqual(["hi @Zed"]);
  });

  it("finds a mention after a line break", () => {
    expect(shown("hi\n@Bob")).toEqual(["hi\n", "[Bob]"]);
  });
});
