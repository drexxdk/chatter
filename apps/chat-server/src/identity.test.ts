import { describe, expect, it } from "vitest";

import { getClientIp, hashIdentifier, validateNickname } from "./identity.js";

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

describe("getClientIp", () => {
  const handshake = (forwardedFor?: string | string[]) => ({
    address: "10.0.0.5",
    headers: { "x-forwarded-for": forwardedFor },
  });

  it("uses the socket address and ignores the header when no proxy is trusted", () => {
    // Anyone can send this header, so trusting it by default would let clients pick their own IP.
    expect(getClientIp(handshake("203.0.113.9"), 0)).toBe("10.0.0.5");
  });

  it("takes the address the single trusted proxy saw", () => {
    expect(getClientIp(handshake("203.0.113.9"), 1)).toBe("203.0.113.9");
  });

  it("ignores entries a client prepended to the header", () => {
    // The trusted proxy appends the real address, so forged leading entries sit to its left.
    expect(getClientIp(handshake("1.2.3.4, 203.0.113.9"), 1)).toBe(
      "203.0.113.9",
    );
  });

  it("counts back through several trusted proxies", () => {
    expect(getClientIp(handshake("203.0.113.9, 10.1.1.1"), 2)).toBe(
      "203.0.113.9",
    );
  });

  it("trims whitespace and handles IPv6", () => {
    expect(getClientIp(handshake(" 1.2.3.4 ,  2001:db8::1 "), 1)).toBe(
      "2001:db8::1",
    );
  });

  it("joins a header that arrived as several lines", () => {
    expect(getClientIp(handshake(["1.2.3.4", "203.0.113.9"]), 1)).toBe(
      "203.0.113.9",
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["shorter than the trusted chain", "203.0.113.9"],
  ])(
    "falls back to the socket address when the header is %s",
    (_label, header) => {
      // A request that skipped the proxy must not be able to claim an address.
      expect(getClientIp(handshake(header), header ? 2 : 1)).toBe("10.0.0.5");
    },
  );
});

describe("hashIdentifier", () => {
  it("is deterministic and never contains the raw IP", () => {
    const hash = hashIdentifier("203.0.113.7");

    expect(hash).toBe(hashIdentifier("203.0.113.7"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
  });

  it("differs per IP", () => {
    expect(hashIdentifier("203.0.113.7")).not.toBe(
      hashIdentifier("203.0.113.8"),
    );
  });
});
