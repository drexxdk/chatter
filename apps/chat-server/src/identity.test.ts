import { describe, expect, it } from "vitest";

import { hashIdentifier, validateNickname } from "./identity.js";

describe("validateNickname", () => {
  it("accepts and trims valid nicknames", () => {
    expect(validateNickname("  Alice  ")).toBe("Alice");
    expect(validateNickname("Jens_Ørsted-2.0")).toBe("Jens_Ørsted-2.0");
    expect(validateNickname("山田 太郎")).toBe("山田 太郎");
  });

  it.each([
    ["missing", undefined],
    ["non-string", 42],
    ["empty", ""],
    ["whitespace only", "   "],
    ["too short", "a"],
    ["too long", "x".repeat(25)],
    ["markup", "<script>"],
    ["control characters", "bad\nname"],
  ])("rejects %s", (_label, value) => {
    expect(validateNickname(value)).toBeNull();
  });

  it("accepts the length boundaries", () => {
    expect(validateNickname("ab")).toBe("ab");
    expect(validateNickname("x".repeat(24))).toBe("x".repeat(24));
  });
});

describe("hashIdentifier", () => {
  it("is deterministic and never contains the raw IP", () => {
    const hash = hashIdentifier("203.0.113.7");

    expect(hash).toBe(hashIdentifier("203.0.113.7"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
  });

  it("differs per IP", () => {
    expect(hashIdentifier("203.0.113.7")).not.toBe(hashIdentifier("203.0.113.8"));
  });
});
