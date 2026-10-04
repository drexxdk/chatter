import crypto from "crypto";

import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "./tokens.js";

const SECRET = "a-secret-that-is-long-enough-for-tests";
const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
const HOUR = 3_600_000;

const claims = { sub: 7, name: "Ada Mod", role: "moderator" as const };
const sign = (overrides: Record<string, unknown> = {}, secret = SECRET) =>
  signToken({ ...claims, ...overrides } as typeof claims, {
    secret,
    ttlMs: 8 * HOUR,
    now: NOW,
  });

// A token built by hand, to try claims the real signer would never produce.
function forge(payload: unknown, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

describe("signToken and verifyToken", () => {
  it("returns the claims of a token it signed, with the expiry", () => {
    expect(verifyToken(sign(), { secret: SECRET, now: NOW })).toEqual({
      ...claims,
      exp: NOW + 8 * HOUR,
    });
  });

  it("is valid until the expiry and not a moment after", () => {
    const token = sign();

    expect(
      verifyToken(token, { secret: SECRET, now: NOW + 8 * HOUR - 1 }),
    ).toBeDefined();
    expect(
      verifyToken(token, { secret: SECRET, now: NOW + 8 * HOUR }),
    ).toBeUndefined();
  });

  it("rejects a token signed with another secret", () => {
    const token = sign({}, "some-other-secret-of-sufficient-length");

    expect(verifyToken(token, { secret: SECRET, now: NOW })).toBeUndefined();
  });

  it("rejects a token whose claims were changed", () => {
    const [, signature] = sign().split(".");
    const edited = Buffer.from(
      JSON.stringify({ ...claims, name: "Someone Else", exp: NOW + HOUR }),
    ).toString("base64url");

    expect(
      verifyToken(`${edited}.${signature}`, { secret: SECRET, now: NOW }),
    ).toBeUndefined();
  });

  it("rejects a token whose signature was changed", () => {
    const [body, signature] = sign().split(".");
    const flipped = signature.startsWith("A")
      ? `B${signature.slice(1)}`
      : `A${signature.slice(1)}`;

    expect(
      verifyToken(`${body}.${flipped}`, { secret: SECRET, now: NOW }),
    ).toBeUndefined();
  });

  it.each([
    ["not a string", 42],
    ["undefined", undefined],
    ["empty", ""],
    ["no signature", "abc"],
    ["too many parts", "a.b.c"],
    ["garbage", "!!!.???"],
  ])("rejects a token that is %s", (_label, token) => {
    expect(verifyToken(token, { secret: SECRET, now: NOW })).toBeUndefined();
  });

  // The signature is only half of it: what is inside must also be something this server could have issued.
  it.each([
    ["an unknown role", { ...claims, role: "admin", exp: NOW + HOUR }],
    ["the guest role", { ...claims, role: "guest", exp: NOW + HOUR }],
    ["no name", { sub: 7, role: "moderator", exp: NOW + HOUR }],
    ["an empty name", { ...claims, name: "", exp: NOW + HOUR }],
    ["no expiry", { ...claims }],
    ["a text expiry", { ...claims, exp: "tomorrow" }],
  ])("rejects a validly signed token with %s", (_label, payload) => {
    expect(
      verifyToken(forge(payload), { secret: SECRET, now: NOW }),
    ).toBeUndefined();
  });

  it("does not put the account's email or password anywhere in the token", () => {
    const decoded = Buffer.from(sign().split(".")[0], "base64url").toString();

    expect(Object.keys(JSON.parse(decoded)).sort()).toEqual([
      "exp",
      "name",
      "role",
      "sub",
    ]);
  });
});
