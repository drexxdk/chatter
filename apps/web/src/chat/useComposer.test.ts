import { describe, expect, it } from "vitest";

import { shiftMentions, type DraftMention } from "./useComposer";

describe("shiftMentions", () => {
  // "hello Siyan Panayotov!" with the name as a mention.
  const before = "hello Siyan Panayotov!";
  const name: DraftMention = { start: 6, end: 21 };

  it("is the same list when the text is", () => {
    const mentions = [name];

    expect(shiftMentions(mentions, before, before)).toBe(mentions);
  });

  it("is the same when there are none", () => {
    const none: DraftMention[] = [];

    expect(shiftMentions(none, "a", "ab")).toBe(none);
  });

  it("moves with words written before it", () => {
    expect(shiftMentions([name], before, `well ${before}`)).toEqual([
      { start: 11, end: 26 },
    ]);
  });

  it("moves back when words before it are deleted", () => {
    expect(shiftMentions([name], before, before.slice(2))).toEqual([
      { start: 4, end: 19 },
    ]);
  });

  it("stays when words are written after it", () => {
    expect(shiftMentions([name], before, `${before} ok`)).toEqual([name]);
    expect(shiftMentions([name], before, "hello Siyan Panayotov ok!")).toEqual([
      name,
    ]);
  });

  it("does not take in the letters written right after it", () => {
    expect(shiftMentions([{ start: 3, end: 6 }], "hi Bob", "hi Bobby")).toEqual(
      [{ start: 3, end: 6 }],
    );
    expect(
      shiftMentions([{ start: 3, end: 6 }], "hi Bob there", "hi Bob! there"),
    ).toEqual([{ start: 3, end: 6 }]);
  });

  it("is gone when a letter in it is changed, added or deleted", () => {
    expect(shiftMentions([name], before, "hello Siyan Panayotv!")).toEqual([]);
    expect(shiftMentions([name], before, "hello Siyan Panxayotov!")).toEqual(
      [],
    );
    expect(shiftMentions([name], before, "hello Siyan Panayoto!")).toEqual([]);
    expect(shiftMentions([name], before, "hello Syan Panayotov!")).toEqual([]);
  });

  it("is gone when the whole text is replaced or emptied", () => {
    expect(shiftMentions([name], before, "something else")).toEqual([]);
    expect(shiftMentions([name], before, "")).toEqual([]);
  });

  it("keeps the others when one is changed", () => {
    const two = [
      { start: 0, end: 3 },
      { start: 8, end: 12 },
    ];

    expect(shiftMentions(two, "Bob and Anne", "Bo and Anne")).toEqual([
      { start: 7, end: 11 },
    ]);
  });
});
