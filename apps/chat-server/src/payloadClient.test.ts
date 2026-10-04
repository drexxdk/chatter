import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchBans, fetchPublicRooms } from "./payloadClient.js";

function respondWith(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => Response.json(body, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const room = {
  id: 1,
  name: "General",
  slug: "general",
  maxMembers: 100,
  description: "Open chat",
};

const ban = {
  id: 7,
  identifierHash: "a".repeat(64),
  reason: "spam",
  expiresAt: "2026-12-01T10:00:00.000Z",
};

describe("fetchPublicRooms", () => {
  it("returns the rooms and sends the service key", async () => {
    const fetchMock = respondWith({ docs: [room] });

    expect(await fetchPublicRooms()).toEqual([room]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://localhost:3000/api/public-rooms?limit=100");
    expect(init.headers).toEqual({
      Authorization: "admins API-Key test-api-key",
    });
  });

  it("accepts an unlimited room (maxMembers missing or null)", async () => {
    respondWith({
      docs: [
        { id: 2, name: "Open", slug: "open" },
        {
          id: 3,
          name: "Open 2",
          slug: "open-2",
          maxMembers: null,
          description: null,
        },
      ],
    });

    const rooms = await fetchPublicRooms();

    expect(rooms.map((r) => r.maxMembers ?? null)).toEqual([null, null]);
  });

  it("keeps a room's slow mode, which guests are shown", async () => {
    respondWith({
      docs: [
        { ...room, slowModeSeconds: 10 },
        { ...room, id: 2, slug: "other", slowModeSeconds: null },
      ],
    });

    const [slow, normal] = await fetchPublicRooms();

    expect(slow.slowModeSeconds).toBe(10);
    expect(normal.slowModeSeconds).toBeNull();
  });

  // /rooms publishes these to anyone, so a field added to the collection later must not leak through.
  it("drops fields it does not know", async () => {
    respondWith({
      docs: [{ ...room, internalNotes: "private", createdAt: "2026-01-01" }],
    });

    expect(await fetchPublicRooms()).toEqual([room]);
  });

  it.each([
    ["no docs", {}, /docs/],
    ["docs that is not a list", { docs: "nope" }, /docs/],
    [
      "a room without a slug",
      { docs: [{ id: 1, name: "x" }] },
      /docs\.0\.slug/,
    ],
    ["a string id", { docs: [{ ...room, id: "1" }] }, /docs\.0\.id/],
    [
      "a zero limit",
      { docs: [{ ...room, maxMembers: 0 }] },
      /docs\.0\.maxMembers/,
    ],
    [
      "a fractional limit",
      { docs: [{ ...room, maxMembers: 2.5 }] },
      /docs\.0\.maxMembers/,
    ],
    [
      "a zero slow mode",
      { docs: [{ ...room, slowModeSeconds: 0 }] },
      /docs\.0\.slowModeSeconds/,
    ],
    [
      "a slow mode in words",
      { docs: [{ ...room, slowModeSeconds: "10" }] },
      /docs\.0\.slowModeSeconds/,
    ],
  ])("rejects %s and names the field", async (_label, body, field) => {
    respondWith(body);

    await expect(fetchPublicRooms()).rejects.toThrow(field);
    await expect(fetchPublicRooms()).rejects.toThrow(/\/api\/public-rooms/);
  });

  it("fails on an HTTP error", async () => {
    respondWith({ errors: [] }, { status: 500, statusText: "Server Error" });

    await expect(fetchPublicRooms()).rejects.toThrow(/500/);
  });
});

describe("fetchBans", () => {
  it("returns the bans", async () => {
    const fetchMock = respondWith({ docs: [ban] });

    expect(await fetchBans()).toEqual([ban]);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://localhost:3000/api/bans?limit=1000",
    );
  });

  it("accepts a permanent ban (no expiry) and an offset timestamp", async () => {
    respondWith({
      docs: [
        { id: 1, identifierHash: "h1" },
        { id: 2, identifierHash: "h2", expiresAt: null },
        { id: 3, identifierHash: "h3", expiresAt: "2026-12-01T10:00:00+02:00" },
      ],
    });

    expect(await fetchBans()).toHaveLength(3);
  });

  // An unreadable expiry used to count as "already expired", which silently lifted the ban.
  it.each([
    [
      "an unreadable expiry",
      { ...ban, expiresAt: "next tuesday" },
      /docs\.0\.expiresAt/,
    ],
    [
      "an empty hash",
      { ...ban, identifierHash: "" },
      /docs\.0\.identifierHash/,
    ],
    ["a missing hash", { id: 1 }, /docs\.0\.identifierHash/],
  ])("rejects %s and names the field", async (_label, doc, field) => {
    respondWith({ docs: [doc] });

    await expect(fetchBans()).rejects.toThrow(field);
  });

  it("does not put ban data in the error", async () => {
    respondWith({ docs: [{ ...ban, expiresAt: "next tuesday" }] });

    const message = await fetchBans().then(
      () => "",
      (error: Error) => error.message,
    );

    expect(message).toMatch(/docs\.0\.expiresAt/);
    expect(message).not.toContain(ban.identifierHash);
    expect(message).not.toContain("next tuesday");
  });
});
