import { describe, expect, it } from "vitest";

import { normalizeNickname, normalizeUsername, tidyName } from "./nickname";

describe("tidyName", () => {
  it("trims, and makes every run of spaces one", () => {
    expect(tidyName("  Alice    Wonder   Land ")).toBe("Alice Wonder Land");
  });
});

describe("normalizeUsername", () => {
  it("accepts a name without spaces, and trims it", () => {
    expect(normalizeUsername(" alice_w ")).toBe("alice_w");
    expect(normalizeUsername("Jens.Ørsted-2")).toBe("Jens.Ørsted-2");
  });

  it.each([
    ["a space inside", "alice w"],
    ["empty", ""],
    ["too short", "a"],
    ["too long", "x".repeat(25)],
    ["markup", "<b>"],
  ])("rejects %s", (_label, value) => {
    expect(normalizeUsername(value)).toBeNull();
  });
});

describe("normalizeNickname", () => {
  it("makes a run of spaces one", () => {
    expect(normalizeNickname("Alice    Wonder")).toBe("Alice Wonder");
  });

  it("accepts and trims valid nicknames", () => {
    expect(normalizeNickname("  Alice  ")).toBe("Alice");
    expect(normalizeNickname("Jens_Ørsted-2.0")).toBe("Jens_Ørsted-2.0");
    expect(normalizeNickname("山田 太郎")).toBe("山田 太郎");
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["too short", "a"],
    ["too long", "x".repeat(25)],
    ["markup", "<script>"],
    ["control characters", "bad\nname"],
  ])("rejects %s", (_label, value) => {
    expect(normalizeNickname(value)).toBeNull();
  });

  it("accepts the length boundaries", () => {
    expect(normalizeNickname("ab")).toBe("ab");
    expect(normalizeNickname("x".repeat(24))).toBe("x".repeat(24));
  });
});
