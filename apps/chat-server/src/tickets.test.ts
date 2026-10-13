import { describe, expect, it } from "vitest";

import { signTicket, verifyTicket } from "./tickets.js";
import { signToken, verifyToken } from "./tokens.js";

const SECRET = "a-secret-of-at-least-32-characters!!";
const NOW = 1_700_000_000_000;
const claims = {
  provider: "google",
  providerUserId: "123",
  email: "a@example.com",
  emailVerified: true,
  name: "Alice",
};

describe("a ticket", () => {
  it("carries what the provider said, until it runs out", () => {
    const ticket = signTicket(claims, {
      secret: SECRET,
      ttlMs: 1000,
      now: NOW,
    });

    expect(verifyTicket(ticket, { secret: SECRET, now: NOW + 999 })).toEqual({
      ...claims,
      exp: NOW + 1000,
    });
    expect(
      verifyTicket(ticket, { secret: SECRET, now: NOW + 1000 }),
    ).toBeUndefined();
  });

  it("is refused with another secret, or when it was changed", () => {
    const ticket = signTicket(claims, {
      secret: SECRET,
      ttlMs: 1000,
      now: NOW,
    });
    const [body, signature] = ticket.split(".") as [string, string];
    const changed = Buffer.from(
      JSON.stringify({ ...claims, providerUserId: "999", exp: NOW + 1000 }),
    ).toString("base64url");

    expect(
      verifyTicket(ticket, { secret: `${SECRET}x`, now: NOW }),
    ).toBeUndefined();
    expect(
      verifyTicket(`${changed}.${signature}`, { secret: SECRET, now: NOW }),
    ).toBeUndefined();
    expect(
      verifyTicket(`${body}.${signature}.extra`, { secret: SECRET, now: NOW }),
    ).toBeUndefined();
  });

  it.each([undefined, null, 5, "", "abc", "a.b", "."])(
    "is refused when it is %j",
    (value) => {
      expect(verifyTicket(value, { secret: SECRET, now: NOW })).toBeUndefined();
    },
  );

  it("is not a session, and a session is not a ticket", () => {
    const ticket = signTicket(claims, {
      secret: SECRET,
      ttlMs: 1000,
      now: NOW,
    });
    const token = signToken(
      { sub: 1, name: "Alice", role: "member" },
      { secret: SECRET, ttlMs: 1000, now: NOW },
    );

    expect(verifyToken(ticket, { secret: SECRET, now: NOW })).toBeUndefined();
    expect(verifyTicket(token, { secret: SECRET, now: NOW })).toBeUndefined();
  });
});
