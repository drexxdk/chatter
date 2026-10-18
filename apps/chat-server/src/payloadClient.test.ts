import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUser,
  deleteReportsBefore,
  deleteUser,
  fetchBans,
  fetchLegal,
  fetchPublicRooms,
  fetchUser,
  fetchUserNames,
  findUserByIdentity,
  isTaken,
  PayloadError,
  saveReport,
  updateUser,
} from "./payloadClient.js";

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

    expect(await fetchPublicRooms()).toEqual([
      { ...room, slowModeSeconds: 10 },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "http://localhost:3000/api/public-rooms?limit=100&locale=all&depth=0",
    );
    expect(init.headers).toEqual({
      Authorization: "admins API-Key test-api-key",
    });
  });

  describe("room text in several languages", () => {
    const localized = {
      ...room,
      name: { en: "Gaming", da: "Spil", de: null },
      description: { en: "Talk games", da: "Snak om spil", de: "" },
    };

    it("keeps English as the name and lists the other languages apart", async () => {
      respondWith({ docs: [localized] });

      expect(await fetchPublicRooms()).toEqual([
        {
          ...room,
          name: "Gaming",
          description: "Talk games",
          slowModeSeconds: 10,
          translations: { da: { name: "Spil", description: "Snak om spil" } },
        },
      ]);
    });

    it("has no translations when only English is written", async () => {
      respondWith({
        docs: [{ ...room, name: { en: "Gaming", da: null, de: null } }],
      });

      const [only] = await fetchPublicRooms();

      expect(only.translations).toBeUndefined();
      expect(only.name).toBe("Gaming");
    });

    it("falls back to another language when the room has no English name", async () => {
      respondWith({ docs: [{ ...room, name: { en: null, da: "Spil" } }] });

      const [danish] = await fetchPublicRooms();

      expect(danish.name).toBe("Spil");
    });

    it("rejects a room with no name in any language", async () => {
      respondWith({ docs: [{ ...room, name: { en: "", da: null } }] });

      await expect(fetchPublicRooms()).rejects.toThrow(/docs\.0\.name/);
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
    respondWith({ docs: [{ ...room, slowModeSeconds: 30 }] });

    const [slow] = await fetchPublicRooms();

    expect(slow.slowModeSeconds).toBe(30);
  });

  // Nobody gets to chat without a wait because an administrator left the field empty.
  it.each([
    ["empty", null],
    ["missing", undefined],
  ])(
    "gives a room whose slow mode is %s the server's default of 10 seconds",
    async (_label, value) => {
      respondWith({ docs: [{ ...room, slowModeSeconds: value }] });

      const [normal] = await fetchPublicRooms();

      expect(normal.slowModeSeconds).toBe(10);
    },
  );

  // /rooms publishes these to anyone, so a field added to the collection later must not leak through.
  it("drops fields it does not know", async () => {
    respondWith({
      docs: [{ ...room, internalNotes: "private", createdAt: "2026-01-01" }],
    });

    expect(await fetchPublicRooms()).toEqual([
      { ...room, slowModeSeconds: 10 },
    ]);
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

describe("saveReport", () => {
  const record = {
    messageId: "m-1",
    roomSlug: "general",
    text: "rude words",
    nickname: "Mallory",
    guestId: "guest-m",
    senderHash: "b".repeat(64),
    reporterCount: 1,
    hidden: false,
    reason: "spam" as const,
  };

  // Answers each call in turn: a lookup, then whatever the test sends back for the write.
  function script(...answers: Response[]) {
    const fetchMock = vi.fn(async () => answers.shift() ?? Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const sent = (fetchMock: ReturnType<typeof script>, call: number) => {
    const [url, init] = fetchMock.mock.calls[call] as unknown as [
      string,
      RequestInit,
    ];
    return {
      url,
      method: init.method,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
  };

  it("makes the report when the message has none yet", async () => {
    const fetchMock = script(Response.json({ docs: [] }), Response.json({}));

    await saveReport(record);

    expect(sent(fetchMock, 0).url).toBe(
      "http://localhost:3000/api/reports?where[messageId][equals]=m-1&limit=1&depth=0",
    );
    expect(sent(fetchMock, 1)).toEqual({
      url: "http://localhost:3000/api/reports",
      method: "POST",
      body: {
        messageId: "m-1",
        roomSlug: "general",
        text: "rude words",
        nickname: "Mallory",
        guestId: "guest-m",
        senderHash: "b".repeat(64),
        reporterCount: 1,
        reasons: ["spam"],
        status: "open",
      },
    });
  });

  it("makes a report that is already hidden as hidden", async () => {
    const fetchMock = script(Response.json({ docs: [] }), Response.json({}));

    await saveReport({ ...record, hidden: true, reporterCount: 3 });

    expect(sent(fetchMock, 1).body).toMatchObject({
      status: "hidden",
      reporterCount: 3,
    });
  });

  it("adds to the report that exists: the count and the reason, never the text", async () => {
    const fetchMock = script(
      Response.json({
        docs: [{ id: 5, reasons: ["harassment"], status: "open" }],
      }),
      Response.json({}),
    );

    await saveReport({ ...record, reporterCount: 2 });

    expect(sent(fetchMock, 1)).toEqual({
      url: "http://localhost:3000/api/reports/5",
      method: "PATCH",
      body: { reporterCount: 2, reasons: ["harassment", "spam"] },
    });
  });

  it("hides an open report once the message is hidden, and leaves a judged one alone", async () => {
    const open = script(
      Response.json({ docs: [{ id: 5, reasons: ["spam"], status: "open" }] }),
      Response.json({}),
    );
    await saveReport({ ...record, hidden: true });
    expect(sent(open, 1).body).toMatchObject({ status: "hidden" });

    const judged = script(
      Response.json({
        docs: [{ id: 5, reasons: ["spam"], status: "dismissed" }],
      }),
      Response.json({}),
    );
    await saveReport({ ...record, hidden: true });
    expect(sent(judged, 1).body).not.toHaveProperty("status");
  });

  it("joins the report another first report made at the same moment", async () => {
    const fetchMock = script(
      Response.json({ docs: [] }),
      Response.json({ errors: [] }, { status: 400 }),
      Response.json({ docs: [{ id: 9, reasons: ["spam"], status: "open" }] }),
      Response.json({}),
    );

    await saveReport(record);

    expect(sent(fetchMock, 3).url).toBe("http://localhost:3000/api/reports/9");
  });

  it("fails when Payload refuses the report and there is none to join", async () => {
    script(
      Response.json({ docs: [] }),
      Response.json({}, { status: 403 }),
      Response.json({ docs: [] }),
    );

    await expect(saveReport(record)).rejects.toThrow(/403/);
  });
});

describe("deleteReportsBefore", () => {
  it("deletes the reports made before the cutoff", async () => {
    const fetchMock = respondWith({ docs: [], errors: [] });

    await deleteReportsBefore(new Date("2026-07-01T00:00:00.000Z"));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "http://localhost:3000/api/reports?where[createdAt][less_than]=2026-07-01T00%3A00%3A00.000Z",
    );
    expect(init.method).toBe("DELETE");
  });

  it("fails when Payload refuses", async () => {
    respondWith({}, { status: 403 });

    await expect(deleteReportsBefore(new Date())).rejects.toThrow(/403/);
  });
});

describe("fetchLegal", () => {
  it("asks for every language of the published global", async () => {
    const fetchMock = respondWith({ termsVersion: "v1", terms: {} });

    await fetchLegal();

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://localhost:3000/api/globals/legal?locale=all&depth=0",
    );
  });

  it("reads the text per language", async () => {
    respondWith({
      termsVersion: "v1",
      contactEmail: "a@example.com",
      terms: {
        title: { en: "Terms", da: null },
        updated: { en: "v1" },
        sections: { en: [{ heading: "H", paragraphs: "P", items: null }] },
      },
      privacy: null,
    });

    expect(await fetchLegal()).toMatchObject({
      termsVersion: "v1",
      terms: { title: { en: "Terms" } },
    });
  });

  it("accepts a global nobody has written yet", async () => {
    respondWith({ id: 1 });

    expect(await fetchLegal()).toEqual({});
  });

  it("accepts the empty lists Payload gives for a global that is saved but empty", async () => {
    respondWith({
      terms: { sections: [] },
      privacy: { sections: [] },
      _status: "draft",
    });

    expect(await fetchLegal()).toEqual({
      terms: { sections: {} },
      privacy: { sections: {} },
    });
  });

  it("rejects a section without a heading and names the field", async () => {
    respondWith({ terms: { sections: { en: [{ paragraphs: "P" }] } } });

    await expect(fetchLegal()).rejects.toThrow(
      /terms\.sections\.en\.0\.heading/,
    );
  });

  it("fails when Payload refuses", async () => {
    respondWith({}, { status: 500 });

    await expect(fetchLegal()).rejects.toThrow(/500/);
  });
});

describe("accounts", () => {
  const claimConflict = {
    errors: [{ data: { errors: [{ path: "key", tableName: "users" }] } }],
  };
  const user = {
    id: 5,
    provider: "google",
    providerUserId: "g1",
    email: "a@example.com",
    nickname: "Alice",
    nicknameKey: "alice",
    displayName: "Alice Wonder",
    displayNameKey: "alicewonder",
    picture: "lorelei:abc12345",
    avatar: "female",
    age: 30,
    lastLoginAt: "2026-10-13T10:00:00.000Z",
  };
  const calls = (fetchMock: ReturnType<typeof respondWith>) =>
    fetchMock.mock.calls as unknown as [string, RequestInit][];

  it("finds the account of an identity and keeps only what the chat needs", async () => {
    const fetchMock = respondWith({ docs: [user] });

    expect(await findUserByIdentity("google:g1")).toEqual({
      id: 5,
      provider: "google",
      providerUserId: "g1",
      email: "a@example.com",
      nickname: "Alice",
      nicknameKey: "alice",
      displayName: "Alice Wonder",
      displayNameKey: "alicewonder",
      picture: "lorelei:abc12345",
      avatar: "female",
      age: 30,
    });
    expect(calls(fetchMock)[0]?.[0]).toBe(
      "http://localhost:3000/api/users?where[identity][equals]=google%3Ag1&limit=1&depth=0",
    );
  });

  it("shows an account made before display names and pictures by its username, with no picture", async () => {
    respondWith({
      ...user,
      displayName: null,
      displayNameKey: null,
      picture: null,
    });

    expect(await fetchUser(5)).toMatchObject({
      displayName: "Alice",
      displayNameKey: "alice",
      picture: undefined,
    });
  });

  it("drops a picture that is not one of the known styles", async () => {
    respondWith({ ...user, picture: "robot:abc12345" });

    expect((await fetchUser(5))?.picture).toBeUndefined();
  });

  it("finds nobody for an identity that has no account", async () => {
    respondWith({ docs: [] });

    expect(await findUserByIdentity("google:none")).toBeUndefined();
  });

  it("makes an unknown avatar the plain one, and an age out of range none", async () => {
    respondWith({ ...user, avatar: "robot", age: 7 });

    expect(await fetchUser(5)).toMatchObject({
      avatar: "other",
      age: undefined,
    });
  });

  it("reads an account that is gone as none, and fails on anything else", async () => {
    respondWith({ errors: [] }, { status: 404 });
    expect(await fetchUser(5)).toBeUndefined();

    respondWith({}, { status: 500 });
    await expect(fetchUser(5)).rejects.toThrow(/500/);
  });

  it("makes an account with the identity worked out, and reads the answer", async () => {
    const fetchMock = respondWith({ doc: user, message: "created" });

    const created = await createUser({
      provider: "google",
      providerUserId: "g1",
      email: "a@example.com",
      nickname: "Alice",
      nicknameKey: "alice",
      displayName: "Alice Wonder",
      displayNameKey: "alicewonder",
      picture: "lorelei:abc12345",
      avatar: "female",
      age: 30,
    });

    const [url, init] = calls(fetchMock)[0] as [string, RequestInit];
    expect(created.id).toBe(5);
    expect(url).toBe("http://localhost:3000/api/users");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      identity: "google:g1",
      nicknameKey: "alice",
      displayNameKey: "alicewonder",
      emailVerified: false,
    });
  });

  it("tells that a nickname or an identity is taken from what Payload answers", async () => {
    respondWith(
      { errors: [{ data: { errors: [{ path: "nicknameKey" }] } }] },
      { status: 400 },
    );

    const error = await createUser({
      provider: "google",
      providerUserId: "g1",
      nickname: "Alice",
      nicknameKey: "alice",
      displayName: "Alice",
      displayNameKey: "alice",
      picture: "thumbs:abc12345",
      avatar: "other",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PayloadError);
    expect(isTaken(error, "nicknameKey")).toBe(true);
    expect(isTaken(error, "identity")).toBe(false);
    // What was answered is for that check only; it is not in the message that gets logged.
    expect((error as Error).message).not.toContain("nicknameKey");
    expect(isTaken(new Error("x"), "nicknameKey")).toBe(false);
  });

  it("changes an account, with a null age taking the age back", async () => {
    const fetchMock = respondWith({ doc: { ...user, age: null } });

    await updateUser(5, { displayName: "Al", age: null });

    const [url, init] = calls(fetchMock)[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/users/5");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      displayName: "Al",
      age: null,
    });
  });

  it.each([
    [true, "nicknameKey"],
    [false, "displayNameKey"],
  ])(
    "maps a shared-name registration conflict to the correct field (username taken: %s)",
    async (usernameTaken, field) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(Response.json(claimConflict, { status: 400 }))
        .mockResolvedValueOnce(
          Response.json({ docs: usernameTaken ? [{ id: 7 }] : [] }),
        );
      vi.stubGlobal("fetch", fetchMock);

      const error = await createUser({ ...user, avatar: "female" }).catch(
        (caught: unknown) => caught,
      );
      expect(isTaken(error, field)).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
        "where[or][0][nicknameKey][equals]=alice&where[or][1][displayNameKey][equals]=alice",
      );
    },
  );

  it("maps a shared-name profile conflict to the display name", async () => {
    respondWith(claimConflict, { status: 400 });
    const error = await updateUser(5, { displayName: "Taken" }).catch(
      (caught: unknown) => caught,
    );
    expect(isTaken(error, "displayNameKey")).toBe(true);
  });

  it("deletes an account", async () => {
    const fetchMock = respondWith({ doc: user });

    await deleteUser(5);

    expect(calls(fetchMock)[0]?.[0]).toBe("http://localhost:3000/api/users/5");
    expect(calls(fetchMock)[0]?.[1].method).toBe("DELETE");
  });

  it("reads every nickname, page after page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          docs: [{ id: 1, nicknameKey: "a", displayNameKey: "aa" }],
          hasNextPage: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          docs: [{ id: 2, nicknameKey: "b", displayNameKey: null }],
          hasNextPage: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchUserNames()).toEqual([
      { id: 1, nicknameKey: "a", displayNameKey: "aa" },
      { id: 2, nicknameKey: "b" },
    ]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("page=2");
  });
});
