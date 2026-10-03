import { describe, expect, it } from "vitest";

import { normalizeNickname } from "./nickname";

describe("normalizeNickname", () => {
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
