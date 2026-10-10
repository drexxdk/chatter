import http from "http";
import type { AddressInfo } from "net";
import type { Server } from "socket.io";
import { io as connectClient, type Socket } from "socket.io-client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  isBanned,
  getCachedPublicRooms,
  recordMessage,
  getHistory,
  redactMessagesFrom,
  toggleReaction,
  getModeratorNames,
  getModerators,
  saveAnnouncement,
  getLatestAnnouncement,
  claimAnnouncementSlot,
  rememberResume,
  verifyResume,
} = vi.hoisted(() => ({
  isBanned: vi.fn(),
  getCachedPublicRooms: vi.fn(),
  recordMessage: vi.fn(),
  getHistory: vi.fn(),
  redactMessagesFrom: vi.fn(),
  toggleReaction: vi.fn(),
  getModeratorNames: vi.fn(),
  getModerators: vi.fn(),
  saveAnnouncement: vi.fn(),
  getLatestAnnouncement: vi.fn(),
  claimAnnouncementSlot: vi.fn(),
  rememberResume: vi.fn(),
  verifyResume: vi.fn(),
}));

vi.mock("./redis.js", () => ({ pubClient: {}, subClient: {} }));
vi.mock("./bans.js", () => ({ isBanned }));
vi.mock("./rooms.js", () => ({ getCachedPublicRooms }));
// The store is mocked, the secrets it hands out are real.
vi.mock("./resume.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./resume.js")>()),
  rememberResume,
  verifyResume,
}));
vi.mock("./announcements.js", () => ({
  saveAnnouncement,
  getLatestAnnouncement,
  claimAnnouncementSlot,
}));
// The cache is mocked, the rule about which names are reserved is not.
vi.mock("./names.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./names.js")>()),
  getModeratorNames,
  getModerators,
}));
vi.mock("./history.js", () => ({
  recordMessage,
  getHistory,
  redactMessagesFrom,
  toggleReaction,
}));
// In-memory adapter standing in for Redis. fetchSockets is delayed because the real adapter does a
// network round trip there, which is what lets simultaneous joins interleave.
vi.mock("@socket.io/redis-adapter", async () => {
  const { Adapter } = await import("socket.io-adapter");

  class LatentAdapter extends Adapter {
    override async fetchSockets(
      opts: Parameters<InstanceType<typeof Adapter>["fetchSockets"]>[0],
    ) {
      // Snapshot first, deliver late: the answer is already stale when the caller gets it.
      const sockets = await super.fetchSockets(opts);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return sockets;
    }
  }

  return { createAdapter: () => LatentAdapter };
});

const {
  createSocketServer,
  enforceBans,
  enforceModerators,
  directMessageWaitMs,
} = await import("./socket.js");
const { signToken } = await import("./tokens.js");
const { hashIdentifier } = await import("./identity.js");

type Ack = { ok: boolean; error?: string; [key: string]: unknown };
type Presence = {
  roomSlug: string;
  members: {
    guestId: string;
    nickname: string;
    avatar?: string;
    age?: number;
  }[];
};

const ROOMS = [
  { id: 1, name: "General", slug: "general", maxMembers: 10 },
  { id: 2, name: "Random", slug: "random", maxMembers: 10 },
  { id: 3, name: "Tiny", slug: "tiny", maxMembers: 1 },
  // Payload returns null for a room whose limit field was left empty.
  { id: 4, name: "Open", slug: "open", maxMembers: null },
  // Guests must wait this many seconds between messages.
  { id: 5, name: "Slow", slug: "slow", maxMembers: null, slowModeSeconds: 10 },
];

let ioServer: Server;
let port: number;
let clients: Socket[] = [];
const extraServers: Server[] = [];

type Session = {
  guestId: string;
  nickname: string;
  role?: string;
  avatar?: string;
  age?: number;
  resumeSecret?: string;
};

function connect(
  auth: Record<string, unknown>,
  targetPort: number = port,
  extraHeaders?: Record<string, string>,
): Promise<{ socket?: Socket; session?: Promise<Session>; error?: string }> {
  return new Promise((resolve) => {
    const socket = connectClient(`http://localhost:${targetPort}`, {
      auth,
      extraHeaders,
      reconnection: false,
      transports: ["websocket"],
    });

    // The server emits `session` as soon as it accepts the connection, so listen before connecting.
    const session = new Promise<Session>((resolveSession) =>
      socket.once("session", resolveSession),
    );

    clients.push(socket);
    socket.on("connect", () => resolve({ socket, session }));
    socket.on("connect_error", (error) => resolve({ error: error.message }));
  });
}

async function connectGuest(
  nickname: string,
  targetPort: number = port,
  extraHeaders?: Record<string, string>,
): Promise<Socket> {
  const { socket } = await connect({ nickname }, targetPort, extraHeaders);
  if (!socket) throw new Error(`Guest ${nickname} failed to connect`);
  return socket;
}

async function startServer(options?: {
  inactivityTimeoutMs?: number;
  maxConnectionsPerIp?: number;
  trustedProxyHops?: number;
  authTokenSecret?: string;
}) {
  const server = http.createServer();
  const io = createSocketServer(server, options);
  extraServers.push(io);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  return { io, port: (server.address() as AddressInfo).port };
}

function emit(socket: Socket, event: string, payload?: unknown): Promise<Ack> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitFor<T>(
  socket: Socket,
  event: string,
  predicate: (value: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve) => {
    const handler = (value: T) => {
      if (predicate(value)) {
        socket.off(event, handler);
        resolve(value);
      }
    };
    socket.on(event, handler);
  });
}

async function waitForNoSockets(): Promise<void> {
  while ((await ioServer.fetchSockets()).length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(async () => {
  ({ io: ioServer, port } = await startServer());
});

afterAll(async () => {
  await Promise.all(
    [ioServer, ...extraServers.splice(0)].map((server) => server.close()),
  );
});

beforeEach(() => {
  isBanned.mockReset().mockResolvedValue(false);
  getCachedPublicRooms.mockReset().mockResolvedValue(ROOMS);
  recordMessage.mockReset().mockResolvedValue(undefined);
  getHistory.mockReset().mockResolvedValue([]);
  redactMessagesFrom.mockReset().mockResolvedValue([]);
  toggleReaction.mockReset().mockResolvedValue({ ok: true, reactions: [] });
  getModeratorNames.mockReset().mockResolvedValue([]);
  // The accounts the tokens in these tests belong to (see tokenFor).
  getModerators.mockReset().mockResolvedValue([
    { id: 7, name: "Ada Mod" },
    { id: 8, name: "Grace" },
  ]);
  saveAnnouncement.mockReset().mockResolvedValue(undefined);
  getLatestAnnouncement.mockReset().mockResolvedValue(undefined);
  claimAnnouncementSlot.mockReset().mockResolvedValue(0);
  rememberResume.mockReset().mockResolvedValue(undefined);
  verifyResume.mockReset().mockResolvedValue(false);
});

afterEach(async () => {
  vi.restoreAllMocks();
  clients.forEach((socket) => socket.disconnect());
  clients = [];
  // Otherwise members left over from one test show up in the next test's presence lists.
  await waitForNoSockets();
});

describe("handshake", () => {
  it.each([
    ["missing", {}],
    ["markup", { nickname: "<script>" }],
    ["too short", { nickname: "a" }],
  ])("rejects a %s nickname", async (_label, auth) => {
    expect((await connect(auth)).error).toBe("invalid_nickname");
    expect(isBanned).not.toHaveBeenCalled();
  });

  it("accepts a guest and sends a session with a trimmed nickname", async () => {
    const { session } = await connect({ nickname: "  Alice  " });
    const received = await session;

    expect(received?.nickname).toBe("Alice");
    expect(received?.guestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("checks bans against a hash of the IP, never the raw address", async () => {
    await connect({ nickname: "Alice" });

    expect(isBanned).toHaveBeenCalledTimes(1);
    expect(isBanned.mock.calls[0][0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects banned guests", async () => {
    isBanned.mockResolvedValue(true);

    expect((await connect({ nickname: "Mallory" })).error).toBe("banned");
  });

  it("fails closed when the ban check errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    isBanned.mockRejectedValue(new Error("redis down"));

    expect((await connect({ nickname: "Alice" })).error).toBe("unavailable");
  });
});

describe("rooms", () => {
  it("rejects joining an unknown room", async () => {
    const alice = await connectGuest("Alice");

    expect(await emit(alice, "room:join", { slug: "nope" })).toEqual({
      ok: false,
      error: "room_not_found",
    });
    expect(await emit(alice, "room:join", undefined)).toMatchObject({
      error: "room_not_found",
    });
  });

  it("lets guests join and shows both in the presence list", async () => {
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");

    expect(await emit(alice, "room:join", { slug: "general" })).toEqual({
      ok: true,
      roomSlug: "general",
      history: [],
    });

    const bothPresent = waitFor<Presence>(
      alice,
      "room:presence",
      (p) => p.members.length === 2,
    );
    await emit(bob, "room:join", { slug: "general" });

    const presence = await bothPresent;
    expect(presence.roomSlug).toBe("general");
    expect(presence.members.map((m) => m.nickname).sort()).toEqual([
      "Alice",
      "Bob",
    ]);
  });

  it("treats rejoining the current room as a no-op", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "tiny" });

    expect(await emit(alice, "room:join", { slug: "tiny" })).toEqual({
      ok: true,
      roomSlug: "tiny",
      history: [],
    });
  });

  it("enforces maxMembers", async () => {
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");

    expect((await emit(alice, "room:join", { slug: "tiny" })).ok).toBe(true);
    expect(await emit(bob, "room:join", { slug: "tiny" })).toEqual({
      ok: false,
      error: "room_full",
    });
  });

  it("lets any number of guests in when the room has no limit", async () => {
    // More guests than the limited rooms above would allow.
    const guests = await Promise.all(
      Array.from({ length: 12 }, (_, i) => connectGuest(`Guest${i}`)),
    );

    const results = await Promise.all(
      guests.map((guest) => emit(guest, "room:join", { slug: "open" })),
    );

    expect(results.every((result) => result.ok)).toBe(true);
    expect(await ioServer.in("room:open").fetchSockets()).toHaveLength(12);
  });

  it("never exceeds maxMembers when guests join simultaneously", async () => {
    const guests = await Promise.all(
      ["A1", "B2", "C3", "D4", "E5"].map((name) => connectGuest(name)),
    );

    const results = await Promise.all(
      guests.map((guest) => emit(guest, "room:join", { slug: "tiny" })),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => result.error === "room_full"),
    ).toHaveLength(4);
    expect(await ioServer.in("room:tiny").fetchSockets()).toHaveLength(1);
  });

  it("frees a seat when a member leaves", async () => {
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");

    await emit(alice, "room:join", { slug: "tiny" });
    await emit(alice, "room:leave");

    expect((await emit(bob, "room:join", { slug: "tiny" })).ok).toBe(true);
  });

  it("moves a guest between rooms and updates the old room's presence", async () => {
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");
    await emit(alice, "room:join", { slug: "general" });
    await emit(bob, "room:join", { slug: "general" });

    const aliceGone = waitFor<Presence>(
      bob,
      "room:presence",
      (p) => p.members.length === 1,
    );
    await emit(alice, "room:join", { slug: "random" });

    expect((await aliceGone).members.map((m) => m.nickname)).toEqual(["Bob"]);
  });

  it("updates presence when a member disconnects", async () => {
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");
    await emit(alice, "room:join", { slug: "general" });
    await emit(bob, "room:join", { slug: "general" });

    const bobGone = waitFor<Presence>(
      alice,
      "room:presence",
      (p) => p.members.length === 1,
    );
    bob.disconnect();

    expect((await bobGone).members.map((m) => m.nickname)).toEqual(["Alice"]);
  });
});

describe("messaging", () => {
  it("rejects sending outside a room", async () => {
    const alice = await connectGuest("Alice");

    expect(await emit(alice, "message:send", { text: "hi" })).toEqual({
      ok: false,
      error: "not_in_room",
    });
  });

  it("broadcasts a trimmed message to everyone in the room, sender included", async () => {
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");
    await emit(alice, "room:join", { slug: "general" });
    await emit(bob, "room:join", { slug: "general" });

    const bobReceives = waitFor<Record<string, unknown>>(bob, "message:new");
    const aliceReceives = waitFor<Record<string, unknown>>(
      alice,
      "message:new",
    );
    expect(await emit(alice, "message:send", { text: "  hello  " })).toEqual({
      ok: true,
    });

    for (const message of [await bobReceives, await aliceReceives]) {
      expect(message).toMatchObject({
        roomSlug: "general",
        nickname: "Alice",
        text: "hello",
      });
      expect(message.id).toEqual(expect.any(String));
      expect(new Date(message.sentAt as string).toISOString()).toBe(
        message.sentAt,
      );
    }
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["too long", "x".repeat(501)],
    ["not a string", 42],
  ])("rejects a %s message", async (_label, text) => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    expect(await emit(alice, "message:send", { text })).toEqual({
      ok: false,
      error: "invalid_message",
    });
  });

  it("accepts a message at the length limit", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    expect(
      (await emit(alice, "message:send", { text: "x".repeat(500) })).ok,
    ).toBe(true);
  });

  it("accepts a message at the length limit made of characters that take more bytes", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    expect(
      (await emit(alice, "message:send", { text: "\u{1F600}".repeat(250) })).ok,
    ).toBe(true);
  });

  it("drops a client that sends a packet far beyond anything it could need", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    const closed = new Promise((resolve) => alice.once("disconnect", resolve));

    alice.emit("message:send", { text: "x".repeat(20 * 1024) });

    await closed;
    expect(recordMessage).not.toHaveBeenCalled();
  });

  it("keeps the lines of a message, but not a run of blank ones", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    const received = waitFor<Record<string, unknown>>(alice, "message:new");
    await emit(alice, "message:send", { text: "one\r\ntwo\n\n\n\n\nthree" });

    expect((await received).text).toBe("one\ntwo\n\nthree");
  });

  it("rate limits after 5 messages in the window", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    for (let i = 0; i < 5; i++) {
      expect((await emit(alice, "message:send", { text: `m${i}` })).ok).toBe(
        true,
      );
    }

    expect(
      await emit(alice, "message:send", { text: "one too many" }),
    ).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("says how long to wait when the limit is reached", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    for (let i = 0; i < 5; i++)
      await emit(alice, "message:send", { text: "m" });

    const refused = await emit(alice, "message:send", { text: "too many" });

    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(5000);
  });

  it("does not leak messages across rooms", async () => {
    const alice = await connectGuest("Alice");
    const carol = await connectGuest("Carol");
    await emit(alice, "room:join", { slug: "general" });
    await emit(carol, "room:join", { slug: "random" });

    const received = vi.fn();
    carol.on("message:new", received);
    await emit(alice, "message:send", { text: "general only" });
    // A later message in carol's own room proves delivery has had time to happen.
    const carolDelivered = waitFor(carol, "message:new");
    await emit(carol, "message:send", { text: "random only" });
    await carolDelivered;

    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0][0]).toMatchObject({ text: "random only" });
  });

  it("survives events sent without an ack callback", async () => {
    const alice = await connectGuest("Alice");
    const joined = waitFor<Presence>(alice, "room:presence");

    alice.emit("room:join", { slug: "general" });
    await joined;
    alice.emit("message:send", { text: "no ack" });

    expect(
      (await emit(alice, "message:send", { text: "still alive" })).ok,
    ).toBe(true);
  });
});

describe("reactions", () => {
  const reacted = [{ emoji: "👍", users: [{ guestId: "g", nickname: "Bob" }] }];

  it("rejects reacting outside a room", async () => {
    const alice = await connectGuest("Alice");

    expect(
      await emit(alice, "reaction:toggle", { messageId: "m1", emoji: "👍" }),
    ).toEqual({ ok: false, error: "not_in_room" });
    expect(toggleReaction).not.toHaveBeenCalled();
  });

  it("toggles for the reacting guest and tells the whole room what the reactions are now", async () => {
    toggleReaction.mockResolvedValue({ ok: true, reactions: reacted });
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");
    const carol = await connectGuest("Carol");
    await emit(alice, "room:join", { slug: "general" });
    await emit(bob, "room:join", { slug: "general" });
    await emit(carol, "room:join", { slug: "random" });
    const received = vi.fn();
    carol.on("reaction:update", received);
    const bobSees = waitFor(bob, "reaction:update");
    const aliceSees = waitFor(alice, "reaction:update");

    expect(
      await emit(bob, "reaction:toggle", { messageId: "m1", emoji: "👍" }),
    ).toEqual({ ok: true });

    const update = {
      roomSlug: "general",
      messageId: "m1",
      reactions: reacted,
    };
    expect(await bobSees).toEqual(update);
    expect(await aliceSees).toEqual(update);
    expect(received).not.toHaveBeenCalled();
    expect(toggleReaction).toHaveBeenCalledWith(
      "general",
      "m1",
      "👍",
      expect.objectContaining({ nickname: "Bob" }),
    );
    expect(toggleReaction.mock.calls[0][3].guestId).toEqual(expect.any(String));
  });

  it.each([
    ["an emoji that is not offered", { messageId: "m1", emoji: "🦖" }],
    ["text instead of an emoji", { messageId: "m1", emoji: "hello" }],
    ["no emoji", { messageId: "m1" }],
    ["no message", { emoji: "👍" }],
    [
      "a message id that is too long",
      { messageId: "m".repeat(65), emoji: "👍" },
    ],
    ["no payload", undefined],
  ])("rejects %s", async (_label, payload) => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    expect(await emit(alice, "reaction:toggle", payload)).toEqual({
      ok: false,
      error: "invalid_reaction",
    });
    expect(toggleReaction).not.toHaveBeenCalled();
  });

  it("says when the message is not in the history any more", async () => {
    toggleReaction.mockResolvedValue({ ok: false, reason: "not_found" });
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    const update = vi.fn();
    alice.on("reaction:update", update);

    expect(
      await emit(alice, "reaction:toggle", { messageId: "gone", emoji: "👍" }),
    ).toEqual({ ok: false, error: "message_not_found" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a reaction the message has no room for", async () => {
    toggleReaction.mockResolvedValue({ ok: false, reason: "full" });
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    expect(
      await emit(alice, "reaction:toggle", { messageId: "m1", emoji: "👍" }),
    ).toEqual({ ok: false, error: "invalid_reaction" });
  });

  it("refuses a reaction to the guest's own message", async () => {
    toggleReaction.mockResolvedValue({ ok: false, reason: "own" });
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    const update = vi.fn();
    alice.on("reaction:update", update);

    expect(
      await emit(alice, "reaction:toggle", { messageId: "m1", emoji: "👍" }),
    ).toEqual({ ok: false, error: "invalid_reaction" });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a Redis failure as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    toggleReaction.mockRejectedValue(new Error("redis down"));
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    expect(
      await emit(alice, "reaction:toggle", { messageId: "m1", emoji: "👍" }),
    ).toEqual({ ok: false, error: "unavailable" });
  });

  it("rate limits after 10 reactions in the window, and says how long to wait", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    for (let i = 0; i < 10; i++) {
      expect(
        (await emit(alice, "reaction:toggle", { messageId: "m1", emoji: "👍" }))
          .ok,
      ).toBe(true);
    }

    const refused = await emit(alice, "reaction:toggle", {
      messageId: "m1",
      emoji: "👍",
    });

    expect(refused).toMatchObject({ ok: false, error: "rate_limited" });
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(5000);
    expect(toggleReaction).toHaveBeenCalledTimes(10);
  });

  it("does not count against the limit on messages", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    for (let i = 0; i < 5; i++) {
      await emit(alice, "reaction:toggle", { messageId: "m1", emoji: "👍" });
    }

    expect((await emit(alice, "message:send", { text: "hi" })).ok).toBe(true);
  });

  it("survives events sent without an ack callback", async () => {
    const alice = await connectGuest("Alice");
    const joined = waitFor<Presence>(alice, "room:presence");
    alice.emit("room:join", { slug: "general" });
    await joined;
    alice.emit("reaction:toggle", { messageId: "m1", emoji: "👍" });

    expect(
      (await emit(alice, "message:send", { text: "still alive" })).ok,
    ).toBe(true);
  });
});

describe("slow mode", () => {
  const SLOW_MS = 10_000;

  // Moves the server's clock, which is all the rate limit looks at.
  function clock(start = Date.now()) {
    let now = start;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    return (ms: number) => void (now += ms);
  }

  async function slowRoomGuest() {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "slow" });
    return alice;
  }

  it("lets a guest send one message, then makes them wait", async () => {
    const advance = clock();
    const alice = await slowRoomGuest();

    expect(await emit(alice, "message:send", { text: "first" })).toEqual({
      ok: true,
    });
    advance(3_000);
    const refused = await emit(alice, "message:send", { text: "second" });

    expect(refused).toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterMs: SLOW_MS - 3_000,
    });
  });

  it("lets the guest send again once the wait is over", async () => {
    const advance = clock();
    const alice = await slowRoomGuest();
    await emit(alice, "message:send", { text: "first" });

    advance(SLOW_MS - 1);
    expect((await emit(alice, "message:send", { text: "early" })).ok).toBe(
      false,
    );
    advance(1);

    expect((await emit(alice, "message:send", { text: "on time" })).ok).toBe(
      true,
    );
  });

  // Trying again must not push the end of the wait further away.
  it("does not count refused attempts", async () => {
    const advance = clock();
    const alice = await slowRoomGuest();
    await emit(alice, "message:send", { text: "first" });

    for (let i = 0; i < 4; i++) {
      advance(2_000);
      await emit(alice, "message:send", { text: "impatient" });
    }
    advance(2_000);

    expect((await emit(alice, "message:send", { text: "now" })).ok).toBe(true);
  });

  it("neither delivers nor records a refused message", async () => {
    const advance = clock();
    const alice = await slowRoomGuest();
    await emit(alice, "message:send", { text: "first" });
    recordMessage.mockClear();
    const received = vi.fn();
    alice.on("message:new", received);

    advance(1_000);
    await emit(alice, "message:send", { text: "second" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(recordMessage).not.toHaveBeenCalled();
    expect(received).not.toHaveBeenCalled();
  });

  it("counts each guest separately", async () => {
    clock();
    const alice = await slowRoomGuest();
    const bob = await connectGuest("Bob");
    await emit(bob, "room:join", { slug: "slow" });
    await emit(alice, "message:send", { text: "first" });

    expect((await emit(bob, "message:send", { text: "mine" })).ok).toBe(true);
  });

  // Otherwise hopping between rooms would be a way round the wait.
  it("carries the wait from one room to another", async () => {
    const advance = clock();
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    await emit(alice, "message:send", { text: "in general" });
    await emit(alice, "room:join", { slug: "slow" });

    advance(2_000);
    const refused = await emit(alice, "message:send", { text: "in slow" });

    expect(refused).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("does not slow down a room that has no slow mode", async () => {
    clock();
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    await emit(alice, "message:send", { text: "one" });

    expect((await emit(alice, "message:send", { text: "two" })).ok).toBe(true);
  });

  it("follows a change to the room's setting straight away", async () => {
    clock();
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    await emit(alice, "message:send", { text: "one" });

    getCachedPublicRooms.mockResolvedValue(
      ROOMS.map((room) =>
        room.slug === "general" ? { ...room, slowModeSeconds: 30 } : room,
      ),
    );
    const refused = await emit(alice, "message:send", { text: "two" });

    expect(refused).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("reports the service as unavailable when the room settings cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });
    getCachedPublicRooms.mockRejectedValue(new Error("redis down"));

    expect(await emit(alice, "message:send", { text: "hi" })).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(recordMessage).not.toHaveBeenCalled();
  });
});

describe("history", () => {
  const stored = [
    {
      id: "old-1",
      roomSlug: "general",
      guestId: "guest-x",
      nickname: "Zed",
      text: "earlier",
      sentAt: "2026-10-03T12:00:00.000Z",
    },
  ];

  it("hands the room's recent messages to a guest who joins", async () => {
    getHistory.mockResolvedValue(stored);
    const alice = await connectGuest("Alice");

    expect(await emit(alice, "room:join", { slug: "general" })).toEqual({
      ok: true,
      roomSlug: "general",
      history: stored,
    });
    expect(getHistory).toHaveBeenCalledWith("general");
  });

  // A message sent while the history is being read is then either in the history or delivered live (or both),
  // never neither. The client removes the duplicate by id.
  it("reads the history only after the guest is in the room", async () => {
    let membersWhenRead = -1;
    getHistory.mockImplementation(async () => {
      membersWhenRead = (await ioServer.in("room:general").fetchSockets())
        .length;
      return [];
    });
    const alice = await connectGuest("Alice");

    await emit(alice, "room:join", { slug: "general" });

    expect(membersWhenRead).toBe(1);
  });

  it("does not hand out history when the join is refused", async () => {
    const alice = await connectGuest("Alice");
    const bob = await connectGuest("Bob");
    await emit(alice, "room:join", { slug: "tiny" });

    expect(await emit(bob, "room:join", { slug: "tiny" })).toEqual({
      ok: false,
      error: "room_full",
    });
    expect(await emit(bob, "room:join", { slug: "nope" })).toMatchObject({
      ok: false,
    });
    // Alice's own join read it once; the two refusals must not have.
    expect(getHistory).toHaveBeenCalledTimes(1);
  });

  it("still lets a guest join when the history cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getHistory.mockRejectedValue(new Error("redis down"));
    const alice = await connectGuest("Alice");

    expect(await emit(alice, "room:join", { slug: "general" })).toEqual({
      ok: true,
      roomSlug: "general",
      history: [],
    });
  });

  it("records each message that is sent, as it was broadcast", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    const delivered = waitFor<Record<string, unknown>>(alice, "message:new");
    await emit(alice, "message:send", { text: "  hello  " });
    const message = await delivered;

    expect(recordMessage).toHaveBeenCalledTimes(1);
    expect(recordMessage).toHaveBeenCalledWith({
      ...message,
      ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  // A ban is tied to the IP hash, so the stored copy needs it; nobody else may ever see it.
  it("stores the sender's IP hash with the message but never broadcasts it", async () => {
    const { port } = await startServer({ trustedProxyHops: 1 });
    const alice = await connectGuest("Alice", port, {
      "x-forwarded-for": "203.0.113.9",
    });
    await emit(alice, "room:join", { slug: "general" });

    const delivered = waitFor<Record<string, unknown>>(alice, "message:new");
    await emit(alice, "message:send", { text: "hello" });

    expect(recordMessage.mock.calls[0][0].ipHash).toBe(
      hashIdentifier("203.0.113.9"),
    );
    expect(await delivered).not.toHaveProperty("ipHash");
  });

  // Anything a guest has seen live must also be in the history a later joiner reads.
  it("records a message before delivering it", async () => {
    let finishRecording!: () => void;
    recordMessage.mockReturnValue(
      new Promise<void>((resolve) => (finishRecording = resolve)),
    );
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    const received = vi.fn();
    alice.on("message:new", received);
    const acked = emit(alice, "message:send", { text: "hello" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).not.toHaveBeenCalled();

    finishRecording();
    expect((await acked).ok).toBe(true);
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
  });

  it("still delivers a message when it cannot be recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    recordMessage.mockRejectedValue(new Error("redis down"));
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    const delivered = waitFor<Record<string, unknown>>(alice, "message:new");

    expect(await emit(alice, "message:send", { text: "hello" })).toEqual({
      ok: true,
    });
    expect(await delivered).toMatchObject({ text: "hello" });
  });

  it("does not record messages that are refused", async () => {
    const alice = await connectGuest("Alice");

    await emit(alice, "message:send", { text: "outside a room" });
    await emit(alice, "room:join", { slug: "general" });
    await emit(alice, "message:send", { text: "   " });
    await emit(alice, "message:send", { text: "x".repeat(1001) });
    for (let i = 0; i < 5; i++)
      await emit(alice, "message:send", { text: "m" });
    await emit(alice, "message:send", { text: "rate limited" });

    expect(recordMessage).toHaveBeenCalledTimes(5);
  });
});

describe("ban enforcement", () => {
  const MALLORY_IP = "203.0.113.1";
  const BOB_IP = "203.0.113.2";
  const malloryHash = hashIdentifier(MALLORY_IP);

  // Each guest comes from its own address, so a ban can hit one of them.
  async function guestAt(port: number, nickname: string, ip: string) {
    const { socket, session } = await connect({ nickname }, port, {
      "x-forwarded-for": ip,
    });
    if (!socket || !session) throw new Error(`${nickname} failed to connect`);
    return { socket, guestId: (await session).guestId };
  }

  async function setup(room = "general") {
    const { io, port } = await startServer({ trustedProxyHops: 1 });
    const mallory = await guestAt(port, "Mallory", MALLORY_IP);
    const bob = await guestAt(port, "Bob", BOB_IP);
    await emit(mallory.socket, "room:join", { slug: room });
    await emit(bob.socket, "room:join", { slug: room });
    return { io, port, mallory, bob };
  }

  const quietFor = (ms = 60) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it("disconnects a banned guest who is still connected, saying why", async () => {
    const { io, mallory, bob } = await setup();
    const kicked = waitFor(mallory.socket, "kicked");
    const closed = new Promise((resolve) =>
      mallory.socket.once("disconnect", resolve),
    );

    await enforceBans(io, [malloryHash]);

    expect(await kicked).toEqual({ reason: "banned" });
    await closed;
    expect(bob.socket.connected).toBe(true);
  });

  it("disconnects every guest behind a banned address", async () => {
    const { io, port, mallory } = await setup();
    const second = await guestAt(port, "Mallory2", MALLORY_IP);

    await enforceBans(io, [malloryHash]);
    await vi.waitFor(() => {
      expect(mallory.socket.connected).toBe(false);
      expect(second.socket.connected).toBe(false);
    });
  });

  it("asks for every room's messages from the banned addresses to be replaced", async () => {
    const { io } = await setup();

    await enforceBans(io, [malloryHash, "other-hash"]);

    expect(redactMessagesFrom.mock.calls.map((call) => call[0]).sort()).toEqual(
      ["general", "open", "random", "slow", "tiny"],
    );
    for (const call of redactMessagesFrom.mock.calls) {
      expect(call[1]).toEqual([malloryHash, "other-hash"]);
    }
  });

  it("tells the room which messages to replace, by id and by the banned guest", async () => {
    const { io, mallory, bob } = await setup();
    redactMessagesFrom.mockImplementation(async (slug: string) =>
      slug === "general" ? ["m1", "m2"] : [],
    );
    const notice = waitFor(bob.socket, "message:redacted");

    await enforceBans(io, [malloryHash]);

    expect(await notice).toEqual({
      roomSlug: "general",
      ids: ["m1", "m2"],
      guestIds: [mallory.guestId],
    });
  });

  // Their earlier messages may be on screens although the server's history no longer holds them.
  it("still names the banned guest when none of their messages are in the history", async () => {
    const { io, mallory, bob } = await setup();
    const notice = waitFor(bob.socket, "message:redacted");

    await enforceBans(io, [malloryHash]);

    expect(await notice).toEqual({
      roomSlug: "general",
      ids: [],
      guestIds: [mallory.guestId],
    });
  });

  it("sends the notice only to the room the messages were in", async () => {
    const { io, port, bob } = await setup("general");
    const elsewhere = await guestAt(port, "Carol", "203.0.113.3");
    await emit(elsewhere.socket, "room:join", { slug: "random" });
    const received = vi.fn();
    elsewhere.socket.on("message:redacted", received);
    const inRoom = waitFor(bob.socket, "message:redacted");

    await enforceBans(io, [malloryHash]);
    await inRoom;
    await quietFor();

    expect(received).not.toHaveBeenCalled();
  });

  it("does not send the notice to the guest who was just removed", async () => {
    const { io, mallory } = await setup();
    const received = vi.fn();
    mallory.socket.on("message:redacted", received);

    await enforceBans(io, [malloryHash]);
    await quietFor();

    expect(received).not.toHaveBeenCalled();
  });

  it("replaces messages even when the author has already left", async () => {
    const { io, bob } = await setup();
    redactMessagesFrom.mockImplementation(async (slug: string) =>
      slug === "general" ? ["left-behind"] : [],
    );
    const notice = waitFor(bob.socket, "message:redacted");

    await enforceBans(io, ["hash-of-someone-not-connected"]);

    expect(await notice).toEqual({
      roomSlug: "general",
      ids: ["left-behind"],
      guestIds: [],
    });
    expect(bob.socket.connected).toBe(true);
  });

  it("stays silent when there is nothing to replace", async () => {
    const { io, bob } = await setup();
    const received = vi.fn();
    bob.socket.on("message:redacted", received);
    const kicked = vi.fn();
    bob.socket.on("kicked", kicked);

    await enforceBans(io, ["hash-of-someone-not-connected"]);
    await quietFor();

    expect(received).not.toHaveBeenCalled();
    expect(kicked).not.toHaveBeenCalled();
  });

  it("does nothing for an empty list", async () => {
    const { io, bob } = await setup();

    await enforceBans(io, []);

    expect(redactMessagesFrom).not.toHaveBeenCalled();
    expect(bob.socket.connected).toBe(true);
  });

  // Recording takes a moment; a ban that lands in it must neither let the message through nor leave it stored.
  it("neither delivers nor keeps a message that was being recorded when the ban landed", async () => {
    const { io, mallory, bob } = await setup();
    let finishRecording!: () => void;
    recordMessage.mockReturnValue(
      new Promise<void>((resolve) => (finishRecording = resolve)),
    );
    const received = vi.fn();
    bob.socket.on("message:new", received);

    mallory.socket.emit("message:send", { text: "last words" });
    await vi.waitFor(() => expect(recordMessage).toHaveBeenCalledTimes(1));
    await enforceBans(io, [malloryHash]);
    redactMessagesFrom.mockClear();
    finishRecording();

    await vi.waitFor(() =>
      expect(redactMessagesFrom).toHaveBeenCalledWith("general", [malloryHash]),
    );
    await quietFor();
    expect(received).not.toHaveBeenCalled();
  });

  it("carries on with the other rooms when one room fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { io, bob } = await setup("random");
    redactMessagesFrom.mockImplementation(async (slug: string) => {
      if (slug === "general") throw new Error("redis down");
      return slug === "random" ? ["m9"] : [];
    });
    const notice = waitFor(bob.socket, "message:redacted");

    await expect(enforceBans(io, [malloryHash])).resolves.toBeUndefined();

    expect(await notice).toMatchObject({ roomSlug: "random", ids: ["m9"] });
  });
});

describe("roles", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";
  const tokenFor = (
    overrides: Record<string, unknown> = {},
    secret = SECRET,
    now = Date.now(),
  ) =>
    signToken(
      { sub: 7, name: "Ada Mod", role: "moderator", ...overrides } as never,
      { secret, ttlMs: 3_600_000, now },
    );

  async function moderator(
    port: number,
    extraHeaders?: Record<string, string>,
  ) {
    const { socket, session, error } = await connect(
      { token: tokenFor() },
      port,
      extraHeaders,
    );
    if (!socket || !session) throw new Error(`sign-in failed: ${error}`);
    return { socket, session: await session };
  }

  it("gives an ordinary guest the guest role", async () => {
    const { session } = await connect({ nickname: "Alice" });

    expect((await session)?.role).toBe("guest");
  });

  it("signs a moderator in with the name from their account, whatever nickname they send", async () => {
    const { port } = await startServer({ authTokenSecret: SECRET });
    const { socket, session } = await connect(
      { token: tokenFor(), nickname: "Something Else" },
      port,
    );

    expect(socket).toBeDefined();
    expect(await session).toMatchObject({
      nickname: "Ada Mod",
      role: "moderator",
    });
  });

  it.each([
    ["garbage", () => "not-a-token"],
    [
      "another secret",
      () => tokenFor({}, "some-other-secret-of-sufficient-length"),
    ],
    [
      "an expired token",
      () => tokenFor({}, SECRET, Date.now() - 2 * 3_600_000),
    ],
    ["an empty token", () => ""],
    ["a number", () => 42],
  ])("refuses %s", async (_label, make) => {
    const { port } = await startServer({ authTokenSecret: SECRET });

    expect((await connect({ token: make() }, port)).error).toBe(
      "invalid_token",
    );
  });

  // No secret means no moderators, and a token must not slip through as a plain guest either.
  it("refuses every token when the server has no signing secret", async () => {
    const { port } = await startServer({ authTokenSecret: "" });

    expect((await connect({ token: tokenFor() }, port)).error).toBe(
      "invalid_token",
    );
  });

  it("lets a moderator in although their address is banned", async () => {
    isBanned.mockResolvedValue(true);
    const { port } = await startServer({ authTokenSecret: SECRET });

    const { session } = await moderator(port);

    expect(session.role).toBe("moderator");
    expect(isBanned).not.toHaveBeenCalled();
  });

  it("still turns a banned guest away", async () => {
    isBanned.mockResolvedValue(true);

    expect((await connect({ nickname: "Mallory" })).error).toBe("banned");
  });

  describe("reserved nicknames", () => {
    it.each(["Moderator", "Admin", "Site Admin", "mod"])(
      "turns a guest named %j away",
      async (nickname) => {
        expect((await connect({ nickname })).error).toBe("reserved_nickname");
      },
    );

    it("turns a guest away who picks a moderator's name", async () => {
      getModeratorNames.mockResolvedValue(["Ada Mod"]);

      expect((await connect({ nickname: "ada_mod" })).error).toBe(
        "reserved_nickname",
      );
    });

    it("does not ask whether the address is banned for a name it refuses anyway", async () => {
      await connect({ nickname: "Admin" });

      expect(isBanned).not.toHaveBeenCalled();
    });

    it("lets the moderator use their own name", async () => {
      getModeratorNames.mockResolvedValue(["Ada Mod"]);
      const { port } = await startServer({ authTokenSecret: SECRET });

      expect((await moderator(port)).session.nickname).toBe("Ada Mod");
    });

    it("fails closed when the list of names cannot be read", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      getModeratorNames.mockRejectedValue(new Error("redis down"));

      expect((await connect({ nickname: "Alice" })).error).toBe("unavailable");
    });
  });

  describe("in a room", () => {
    it("tells the room who is a moderator", async () => {
      const { port } = await startServer({ authTokenSecret: SECRET });
      const alice = await connectGuest("Alice", port);
      const ada = await moderator(port);
      await emit(alice, "room:join", { slug: "general" });
      const presence = waitFor<Presence>(
        alice,
        "room:presence",
        (p) => p.members.length === 2,
      );

      await emit(ada.socket, "room:join", { slug: "general" });

      expect((await presence).members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nickname: "Alice", role: "guest" }),
          expect.objectContaining({ nickname: "Ada Mod", role: "moderator" }),
        ]),
      );
    });

    it("stamps each message with the sender's role", async () => {
      const { port } = await startServer({ authTokenSecret: SECRET });
      const alice = await connectGuest("Alice", port);
      const ada = await moderator(port);
      await emit(alice, "room:join", { slug: "general" });
      await emit(ada.socket, "room:join", { slug: "general" });
      const received = waitFor<Record<string, unknown>>(
        alice,
        "message:new",
        (m) => m.nickname === "Ada Mod",
      );

      await emit(ada.socket, "message:send", { text: "welcome" });

      expect(await received).toMatchObject({
        nickname: "Ada Mod",
        role: "moderator",
        text: "welcome",
      });
    });

    it("stamps a guest's message as a guest's", async () => {
      const alice = await connectGuest("Alice");
      await emit(alice, "room:join", { slug: "general" });
      const received = waitFor<Record<string, unknown>>(alice, "message:new");

      await emit(alice, "message:send", { text: "hi" });

      expect(await received).toMatchObject({ role: "guest" });
    });

    it("remembers the role with the message, and the IP hash only for guests", async () => {
      const { port } = await startServer({
        authTokenSecret: SECRET,
        trustedProxyHops: 1,
      });
      const alice = await connectGuest("Alice", port, {
        "x-forwarded-for": "203.0.113.5",
      });
      const ada = await moderator(port, { "x-forwarded-for": "203.0.113.6" });
      await emit(alice, "room:join", { slug: "general" });
      await emit(ada.socket, "room:join", { slug: "general" });

      await emit(alice, "message:send", { text: "hi" });
      await emit(ada.socket, "message:send", { text: "welcome" });

      const [guestCopy, moderatorCopy] = recordMessage.mock.calls.map(
        (call) => call[0],
      );
      expect(guestCopy).toMatchObject({
        role: "guest",
        ipHash: hashIdentifier("203.0.113.5"),
      });
      // A ban on a shared address must never be able to reach a moderator's messages.
      expect(moderatorCopy).toMatchObject({ role: "moderator", ipHash: "" });
    });

    it("holds a moderator to the same slow mode as a guest", async () => {
      let now = Date.now();
      vi.spyOn(Date, "now").mockImplementation(() => now);
      const { port } = await startServer({ authTokenSecret: SECRET });
      const ada = await moderator(port);
      await emit(ada.socket, "room:join", { slug: "slow" });
      await emit(ada.socket, "message:send", { text: "first" });

      now += 2_000;
      const refused = await emit(ada.socket, "message:send", {
        text: "second",
      });

      expect(refused).toMatchObject({ ok: false, error: "rate_limited" });
    });
  });

  it("does not remove a moderator when their address is banned", async () => {
    const { io, port } = await startServer({
      authTokenSecret: SECRET,
      trustedProxyHops: 1,
    });
    const ada = await moderator(port, { "x-forwarded-for": "203.0.113.9" });
    const alice = await connectGuest("Alice", port, {
      "x-forwarded-for": "203.0.113.9",
    });
    const gone = new Promise((resolve) => alice.once("disconnect", resolve));

    await enforceBans(io, [hashIdentifier("203.0.113.9")]);
    await gone;

    // Checked on the server: the client would learn of a removal later than Alice's.
    const stillConnected = [...io.sockets.sockets.values()].map(
      (socket) => socket.data.nickname,
    );
    expect(stillConnected).toEqual(["Ada Mod"]);
    expect(ada.socket.connected).toBe(true);
  });
});

describe("connections per IP", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";
  const moderatorAuth = () => ({
    token: signToken(
      { sub: 7, name: "Ada Mod", role: "moderator" },
      { secret: SECRET, ttlMs: 3_600_000 },
    ),
  });

  // Somebody has to be able to moderate when guests are filling the limit.
  it("lets a moderator in when the cap is full, without counting them", async () => {
    const { io, port } = await startServer({
      maxConnectionsPerIp: 1,
      authTokenSecret: SECRET,
    });
    await connectGuest("One", port);

    const first = await connect(moderatorAuth(), port);
    const second = await connect(moderatorAuth(), port);

    expect(first.socket).toBeDefined();
    expect(second.socket).toBeDefined();
    expect(await io.fetchSockets()).toHaveLength(3);
  });

  it("does not free somebody else's slot when a moderator leaves", async () => {
    const { io, port } = await startServer({
      maxConnectionsPerIp: 1,
      authTokenSecret: SECRET,
    });
    await connectGuest("One", port);
    const { socket } = await connect(moderatorAuth(), port);

    socket?.disconnect();
    await vi.waitFor(async () =>
      expect(await io.fetchSockets()).toHaveLength(1),
    );

    expect((await connect({ nickname: "Two" }, port)).error).toBe(
      "too_many_connections",
    );
  });

  it("turns away connections beyond the cap", async () => {
    const { port } = await startServer({ maxConnectionsPerIp: 2 });

    await connectGuest("One", port);
    await connectGuest("Two", port);

    expect((await connect({ nickname: "Three" }, port)).error).toBe(
      "too_many_connections",
    );
  });

  it("frees a slot when a guest disconnects", async () => {
    const { io, port } = await startServer({ maxConnectionsPerIp: 1 });
    const first = await connectGuest("One", port);
    expect((await connect({ nickname: "Two" }, port)).error).toBe(
      "too_many_connections",
    );

    first.disconnect();
    await vi.waitFor(async () =>
      expect(await io.fetchSockets()).toHaveLength(0),
    );

    expect((await connect({ nickname: "Two" }, port)).socket).toBeDefined();
  });

  it("does not hold a slot for a guest who left during the ban check", async () => {
    const { port } = await startServer({ maxConnectionsPerIp: 1 });
    isBanned.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(false), 150)),
    );

    const quitter = connectClient(`http://localhost:${port}`, {
      auth: { nickname: "Quitter" },
      reconnection: false,
      transports: ["websocket"],
    });
    clients.push(quitter);
    // The transport is open but the server is still waiting on the ban check.
    await new Promise<void>((resolve) => quitter.io.once("open", resolve));
    quitter.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect((await connect({ nickname: "Next" }, port)).socket).toBeDefined();
  });

  it("counts each IP separately behind a trusted proxy", async () => {
    const { port } = await startServer({
      maxConnectionsPerIp: 1,
      trustedProxyHops: 1,
    });
    const from = (ip: string) => ({ "x-forwarded-for": ip });

    await connectGuest("Alice", port, from("203.0.113.1"));

    expect(
      (await connect({ nickname: "Alice2" }, port, from("203.0.113.1"))).error,
    ).toBe("too_many_connections");
    expect(
      (await connect({ nickname: "Bob" }, port, from("203.0.113.2"))).socket,
    ).toBeDefined();
  });

  it("is not fooled by a forged forwarding header", async () => {
    const { port } = await startServer({
      maxConnectionsPerIp: 1,
      trustedProxyHops: 1,
    });

    // The proxy appends the real address, so only the last entry counts however many a client invents.
    await connectGuest("Alice", port, {
      "x-forwarded-for": "1.1.1.1, 9.9.9.9",
    });

    expect(
      (
        await connect({ nickname: "Mallory" }, port, {
          "x-forwarded-for": "2.2.2.2, 9.9.9.9",
        })
      ).error,
    ).toBe("too_many_connections");
  });

  it("checks bans against the forwarded address when a proxy is trusted", async () => {
    const { port } = await startServer({ trustedProxyHops: 1 });

    await connectGuest("Alice", port, { "x-forwarded-for": "203.0.113.9" });

    expect(isBanned).toHaveBeenCalledWith(hashIdentifier("203.0.113.9"));
  });

  it("ignores the forwarding header when no proxy is trusted", async () => {
    const { port } = await startServer();

    await connectGuest("Mallory", port, { "x-forwarded-for": "203.0.113.9" });

    // Otherwise a banned guest could dodge a ban just by sending a different address.
    expect(isBanned).not.toHaveBeenCalledWith(hashIdentifier("203.0.113.9"));
  });

  it("applies no cap when none is configured", async () => {
    // Nothing is passed and MAX_CONNECTIONS_PER_IP is unset, so every connection is accepted.
    const { port } = await startServer();

    for (const name of ["One", "Two", "Three", "Four"]) {
      await connectGuest(name, port);
    }
  });
});

describe("inactivity", () => {
  const TIMEOUT_MS = 200;
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    server = await startServer({ inactivityTimeoutMs: TIMEOUT_MS });
  });

  afterAll(async () => {
    await server.io.close();
  });

  it("disconnects an idle guest, says why, and frees their seat", async () => {
    const idle = await connectGuest("Idle", server.port);
    const kicked = waitFor<{ reason: string }>(idle, "kicked");
    const disconnected = new Promise((resolve) =>
      idle.once("disconnect", resolve),
    );

    await emit(idle, "room:join", { slug: "tiny" });

    expect(await kicked).toEqual({ reason: "inactivity" });
    await disconnected;

    const other = await connectGuest("Other", server.port);
    expect((await emit(other, "room:join", { slug: "tiny" })).ok).toBe(true);
  });

  it("keeps a guest connected while they keep sending events", async () => {
    const active = await connectGuest("Active", server.port);
    const onKicked = vi.fn();
    active.on("kicked", onKicked);

    // Twice the timeout in total, but never idle for longer than 50ms.
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await emit(active, "room:join", { slug: "general" });
    }

    expect(active.connected).toBe(true);
    expect(onKicked).not.toHaveBeenCalled();
  });
});

describe("announcements", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";
  const token = (sub = 7) =>
    signToken(
      { sub, name: "Ada Mod", role: "moderator" },
      {
        secret: SECRET,
        ttlMs: 3_600_000,
      },
    );

  // Listens before connecting: a waiting announcement arrives right behind the session.
  function open(port: number, auth: Record<string, unknown>) {
    const received: Record<string, unknown>[] = [];
    const socket = connectClient(`http://localhost:${port}`, {
      auth,
      reconnection: false,
      transports: ["websocket"],
    });
    socket.on("announcement:new", (value) => received.push(value));
    clients.push(socket);

    return new Promise<{ socket: Socket; received: typeof received }>(
      (resolve, reject) => {
        socket.on("connect", () => resolve({ socket, received }));
        socket.on("connect_error", reject);
      },
    );
  }

  async function startWithModerators() {
    return (await startServer({ authTokenSecret: SECRET })).port;
  }

  it("shows a moderator's announcement to everyone connected, in a room or not", async () => {
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });
    const alice = await open(port, { nickname: "Alice" });
    const bob = await open(port, { nickname: "Bob" });
    await emit(bob.socket, "room:join", { slug: "general" });
    const heardByAlice = waitFor(alice.socket, "announcement:new");
    const heardByBob = waitFor(bob.socket, "announcement:new");
    const heardByAda = waitFor(ada.socket, "announcement:new");

    const ack = await emit(ada.socket, "announce:send", {
      text: "  Maintenance at noon  ",
    });

    expect(ack).toEqual({ ok: true });
    for (const heard of [heardByAlice, heardByBob, heardByAda]) {
      expect(await heard).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        text: "Maintenance at noon",
        sentAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        name: "Ada Mod",
      });
    }
  });

  it("remembers it for people who connect later", async () => {
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });
    const heard = waitFor<{ id: string }>(ada.socket, "announcement:new");

    await emit(ada.socket, "announce:send", { text: "Maintenance at noon" });

    expect(saveAnnouncement).toHaveBeenCalledWith({
      id: (await heard).id,
      text: "Maintenance at noon",
      sentAt: expect.any(String),
      name: "Ada Mod",
    });
  });

  it("does not put it in any room's history", async () => {
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });
    await emit(ada.socket, "room:join", { slug: "general" });

    await emit(ada.socket, "announce:send", { text: "Maintenance at noon" });

    expect(recordMessage).not.toHaveBeenCalled();
  });

  it("refuses a guest, and says nothing to anyone", async () => {
    const port = await startWithModerators();
    const alice = await open(port, { nickname: "Alice" });
    const bob = await open(port, { nickname: "Bob" });

    const ack = await emit(alice.socket, "announce:send", {
      text: "Free prizes",
    });
    await emit(bob.socket, "room:leave");

    expect(ack).toEqual({ ok: false, error: "forbidden" });
    expect(bob.received).toEqual([]);
    expect(claimAnnouncementSlot).not.toHaveBeenCalled();
    expect(saveAnnouncement).not.toHaveBeenCalled();
  });

  // A refused attempt must not use up the minute.
  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["missing", undefined],
    ["a number", 42],
    ["too long", "x".repeat(501)],
  ])("refuses an announcement that is %s", async (_label, text) => {
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });

    expect(await emit(ada.socket, "announce:send", { text })).toEqual({
      ok: false,
      error: "invalid_message",
    });
    expect(claimAnnouncementSlot).not.toHaveBeenCalled();
  });

  it("accepts the longest allowed announcement", async () => {
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });

    expect(
      await emit(ada.socket, "announce:send", { text: "x".repeat(500) }),
    ).toEqual({ ok: true });
  });

  it("makes a moderator wait when they announced a moment ago, and says for how long", async () => {
    claimAnnouncementSlot.mockResolvedValue(42_000);
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });
    const alice = await open(port, { nickname: "Alice" });

    const ack = await emit(ada.socket, "announce:send", { text: "Again" });
    await emit(alice.socket, "room:leave");

    expect(ack).toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterMs: 42_000,
    });
    expect(alice.received).toEqual([]);
    expect(saveAnnouncement).not.toHaveBeenCalled();
  });

  it("counts the wait per account, so a second connection is no way round it", async () => {
    const port = await startWithModerators();
    const first = await open(port, { token: token(7) });
    const other = await open(port, { token: token(8) });

    await emit(first.socket, "announce:send", { text: "One" });
    await emit(other.socket, "announce:send", { text: "Two" });

    expect(claimAnnouncementSlot.mock.calls).toEqual([[7], [8]]);
  });

  it("refuses when the wait cannot be checked, and says nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    claimAnnouncementSlot.mockRejectedValue(new Error("redis down"));
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });
    const alice = await open(port, { nickname: "Alice" });

    const ack = await emit(ada.socket, "announce:send", { text: "Hello" });
    await emit(alice.socket, "room:leave");

    expect(ack).toEqual({ ok: false, error: "unavailable" });
    expect(alice.received).toEqual([]);
  });

  it("still delivers it live when it cannot be remembered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveAnnouncement.mockRejectedValue(new Error("redis down"));
    const port = await startWithModerators();
    const ada = await open(port, { token: token() });
    const alice = await open(port, { nickname: "Alice" });
    const heard = waitFor(alice.socket, "announcement:new");

    expect(await emit(ada.socket, "announce:send", { text: "Hello" })).toEqual({
      ok: true,
    });
    expect(await heard).toMatchObject({ text: "Hello" });
  });

  it("hands the latest announcement to anyone who connects", async () => {
    const latest = {
      id: "a-1",
      text: "Maintenance at noon",
      sentAt: "2026-10-04T10:00:00.000Z",
      name: "Ada Mod",
    };
    getLatestAnnouncement.mockResolvedValue(latest);

    const alice = await open(port, { nickname: "Alice" });
    await vi.waitFor(() => expect(alice.received).toEqual([latest]));
  });

  it("sends nothing to a newcomer when there is no announcement", async () => {
    const alice = await open(port, { nickname: "Alice" });
    await emit(alice.socket, "room:leave");

    expect(alice.received).toEqual([]);
  });

  it("lets a newcomer in even when the latest announcement cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getLatestAnnouncement.mockRejectedValue(new Error("redis down"));

    const alice = await open(port, { nickname: "Alice" });

    expect(alice.socket.connected).toBe(true);
    expect(await emit(alice.socket, "room:leave")).toEqual({ ok: true });
  });
});

describe("moderator access", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";
  const authFor = (sub: number) => ({
    token: signToken(
      { sub, name: "Ada Mod", role: "moderator" },
      { secret: SECRET, ttlMs: 3_600_000 },
    ),
  });

  describe("signing in", () => {
    it("refuses a token whose account may no longer moderate", async () => {
      getModerators.mockResolvedValue([{ id: 8, name: "Grace" }]);
      const { port } = await startServer({ authTokenSecret: SECRET });

      expect((await connect(authFor(7), port)).error).toBe("invalid_token");
    });

    it("refuses every token when nobody may moderate", async () => {
      getModerators.mockResolvedValue([]);
      const { port } = await startServer({ authTokenSecret: SECRET });

      expect((await connect(authFor(7), port)).error).toBe("invalid_token");
    });

    it.each([
      ["has never been read", undefined],
      ["cannot be read", new Error("redis down")],
    ])(
      "fails closed when the list of moderators %s",
      async (_label, outcome) => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        if (outcome instanceof Error) getModerators.mockRejectedValue(outcome);
        else getModerators.mockResolvedValue(outcome);
        const { port } = await startServer({ authTokenSecret: SECRET });

        expect((await connect(authFor(7), port)).error).toBe("unavailable");
      },
    );

    it("does not look at the list for a guest", async () => {
      await connect({ nickname: "Alice" });

      expect(getModerators).not.toHaveBeenCalled();
    });
  });

  describe("while connected", () => {
    async function connectAll() {
      const { io, port } = await startServer({ authTokenSecret: SECRET });
      const ada = await connect(authFor(7), port);
      const grace = await connect(authFor(8), port);
      const alice = await connect({ nickname: "Alice" }, port);
      const kicked = (socket?: Socket) => {
        const events: unknown[] = [];
        socket?.on("kicked", (reason) => events.push(reason));
        return events;
      };

      return {
        io,
        ada: ada.socket!,
        grace: grace.socket!,
        alice: alice.socket!,
        adaKicks: kicked(ada.socket),
        graceKicks: kicked(grace.socket),
        aliceKicks: kicked(alice.socket),
      };
    }

    it("removes a moderator who may no longer moderate, saying their session is over", async () => {
      const { io, ada, adaKicks, grace, alice } = await connectAll();
      const gone = new Promise((resolve) => ada.once("disconnect", resolve));

      await enforceModerators(io, [8]);
      await gone;

      expect(adaKicks).toEqual([{ reason: "invalid_token" }]);
      expect(grace.connected).toBe(true);
      expect(alice.connected).toBe(true);
    });

    it("removes every moderator, but no guest, when nobody may moderate", async () => {
      const { io, ada, grace, alice, aliceKicks } = await connectAll();
      const gone = Promise.all(
        [ada, grace].map(
          (socket) =>
            new Promise((resolve) => socket.once("disconnect", resolve)),
        ),
      );

      await enforceModerators(io, []);
      await gone;

      expect(aliceKicks).toEqual([]);
      expect(alice.connected).toBe(true);
    });

    it("leaves moderators who still may moderate alone", async () => {
      const { io, adaKicks, graceKicks, ada, grace } = await connectAll();

      await enforceModerators(io, [7, 8]);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect([adaKicks, graceKicks]).toEqual([[], []]);
      expect([ada.connected, grace.connected]).toEqual([true, true]);
    });

    it("tells the room when a removed moderator was in it", async () => {
      const { io, ada, alice } = await connectAll();
      await emit(ada, "room:join", { slug: "general" });
      await emit(alice, "room:join", { slug: "general" });
      const left = waitFor<Presence>(
        alice,
        "room:presence",
        (presence) => presence.members.length === 1,
      );

      await enforceModerators(io, []);

      expect((await left).members.map((member) => member.nickname)).toEqual([
        "Alice",
      ]);
    });
  });
});

describe("direct messages", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";
  const RATE_WINDOW_MS = 5_000;

  function clock(start = Date.now()) {
    let now = start;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    return (ms: number) => void (now += ms);
  }

  async function inRoom(
    auth: Record<string, unknown>,
    slug = "general",
    targetPort: number = port,
  ) {
    const { socket, session, error } = await connect(auth, targetPort);
    if (!socket || !session) throw new Error(`could not connect: ${error}`);
    const { guestId, nickname } = await session;
    await emit(socket, "room:join", { slug });
    const received: DirectMessage[] = [];
    socket.on("dm:new", (message) => received.push(message));

    return { socket, guestId, nickname, received };
  }

  type DirectMessage = {
    id: string;
    fromGuestId: string;
    fromNickname: string;
    fromRole: string;
    toGuestId: string;
    toNickname: string;
    text: string;
    sentAt: string;
  };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
  const send = (
    from: { socket: Socket },
    to: { guestId: string },
    text = "hello",
  ) => emit(from.socket, "dm:send", { toGuestId: to.guestId, text });

  describe("sending", () => {
    it("delivers a message to the other guest, and shows it to the sender too", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      const heardByBob = waitFor<DirectMessage>(bob.socket, "dm:new");
      const heardByAlice = waitFor<DirectMessage>(alice.socket, "dm:new");

      const ack = await send(alice, bob, "  hello Bob  ");

      expect(ack).toEqual({ ok: true });
      const expected = {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        fromGuestId: alice.guestId,
        fromNickname: "Alice",
        fromRole: "guest",
        fromAvatar: "other",
        toGuestId: bob.guestId,
        toNickname: "Bob",
        toAvatar: "other",
        text: "hello Bob",
        sentAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      };
      expect(await heardByBob).toEqual(expected);
      expect(await heardByAlice).toEqual(expected);
    });

    it("says who a moderator is", async () => {
      const { port } = await startServer({ authTokenSecret: SECRET });
      const token = signToken(
        { sub: 7, name: "Ada Mod", role: "moderator" },
        { secret: SECRET, ttlMs: 3_600_000 },
      );
      const ada = await inRoom({ token }, "general", port);
      const bob = await inRoom({ nickname: "Bob" }, "general", port);
      const heard = waitFor<DirectMessage>(bob.socket, "dm:new");

      await send(ada, bob, "please keep it friendly");

      expect(await heard).toMatchObject({
        fromNickname: "Ada Mod",
        fromRole: "moderator",
      });
    });

    it("keeps it between the two of them", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      const carol = await inRoom({ nickname: "Carol" });

      await send(alice, bob);
      await settle();

      expect(bob.received).toHaveLength(1);
      expect(carol.received).toEqual([]);
    });

    it("does not put it in any room's history", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });

      await send(alice, bob);

      expect(recordMessage).not.toHaveBeenCalled();
    });

    it("needs the sender to be in a room", async () => {
      const bob = await inRoom({ nickname: "Bob" });
      const { socket } = await connect({ nickname: "Alice" });

      expect(await send({ socket: socket! }, bob)).toEqual({
        ok: false,
        error: "not_in_room",
      });
    });

    it.each([
      ["in another room", "random"],
      ["no longer connected", undefined],
    ])("refuses somebody who is %s", async (_label, slug) => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" }, slug ?? "general");
      if (!slug) {
        bob.socket.disconnect();
        await vi.waitFor(async () =>
          expect(
            (await ioServer.fetchSockets()).map((s) => s.data.nickname),
          ).toEqual(["Alice"]),
        );
      }

      expect(await send(alice, bob)).toEqual({
        ok: false,
        error: "user_not_found",
      });
      expect(bob.received).toEqual([]);
    });

    it.each([
      ["nobody", { text: "hi" }],
      ["a number", { toGuestId: 5, text: "hi" }],
    ])("refuses a message to %s", async (_label, payload) => {
      const alice = await inRoom({ nickname: "Alice" });

      expect(await emit(alice.socket, "dm:send", payload)).toEqual({
        ok: false,
        error: "invalid_recipient",
      });
    });

    it("refuses a message to oneself", async () => {
      const alice = await inRoom({ nickname: "Alice" });

      expect(await send(alice, alice)).toEqual({
        ok: false,
        error: "invalid_recipient",
      });
    });

    it.each([
      ["empty", ""],
      ["only spaces", "   "],
      ["missing", undefined],
      ["a number", 42],
      ["too long", "x".repeat(501)],
    ])("refuses a message that is %s", async (_label, text) => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });

      expect(
        await emit(alice.socket, "dm:send", { toGuestId: bob.guestId, text }),
      ).toEqual({ ok: false, error: "invalid_message" });
      expect(bob.received).toEqual([]);
    });

    it("accepts the longest allowed message", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });

      expect(await send(alice, bob, "x".repeat(500))).toEqual({ ok: true });
    });

    it("answers unavailable when the room cannot be looked up", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      vi.spyOn(ioServer, "in").mockImplementation(() => {
        throw new Error("redis down");
      });

      expect(await send(alice, bob)).toEqual({
        ok: false,
        error: "unavailable",
      });
    });
  });

  describe("blocking", () => {
    it("tells the blocked guest, and stops what they send reaching the person who blocked them", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      await emit(bob.socket, "dm:block", { guestId: alice.guestId });

      const ack = await send(alice, bob, "are you there?");

      expect(ack).toEqual({ ok: false, error: "blocked_by_recipient" });
      await settle();
      expect(bob.received).toEqual([]);
      expect(alice.received).toEqual([]);
    });

    it("tells the guest who was blocked, and who unblocked them again", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      const blocked = waitFor<Record<string, unknown>>(
        alice.socket,
        "dm:blocked",
      );

      await emit(bob.socket, "dm:block", { guestId: alice.guestId });

      expect(await blocked).toMatchObject({
        guestId: bob.guestId,
        nickname: "Bob",
        role: "guest",
      });

      const unblocked = waitFor<Record<string, unknown>>(
        alice.socket,
        "dm:unblocked",
      );

      await emit(bob.socket, "dm:unblock", { guestId: alice.guestId });

      expect(await unblocked).toMatchObject({ guestId: bob.guestId });
    });

    it("does not tell anybody about blocking somebody twice, or about unblocking somebody who was not blocked", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      const heard: string[] = [];
      alice.socket.on("dm:blocked", () => heard.push("blocked"));
      alice.socket.on("dm:unblocked", () => heard.push("unblocked"));

      await emit(bob.socket, "dm:unblock", { guestId: alice.guestId });
      await emit(bob.socket, "dm:block", { guestId: alice.guestId });
      await emit(bob.socket, "dm:block", { guestId: alice.guestId });
      await settle();

      expect(heard).toEqual(["blocked"]);
    });

    it("refuses a message to somebody the guest has blocked, until they are unblocked", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      await emit(alice.socket, "dm:block", { guestId: bob.guestId });

      expect(await send(alice, bob, "sorry")).toEqual({
        ok: false,
        error: "recipient_blocked",
      });
      expect(bob.received).toEqual([]);

      await emit(alice.socket, "dm:unblock", { guestId: bob.guestId });

      expect(await send(alice, bob, "sorry")).toEqual({ ok: true });
    });

    it("lets the blocked guest through again once unblocked", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      await emit(bob.socket, "dm:block", { guestId: alice.guestId });
      await emit(bob.socket, "dm:unblock", { guestId: alice.guestId });
      const heard = waitFor<DirectMessage>(bob.socket, "dm:new");

      await send(alice, bob);

      expect((await heard).fromNickname).toBe("Alice");
    });

    it("only blocks the one person", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      const carol = await inRoom({ nickname: "Carol" });
      await emit(bob.socket, "dm:block", { guestId: alice.guestId });
      const heard = waitFor<DirectMessage>(bob.socket, "dm:new");

      await send(carol, bob);

      expect((await heard).fromNickname).toBe("Carol");
    });

    it("does not let the guest who blocked somebody write to them either", async () => {
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      await emit(bob.socket, "dm:block", { guestId: alice.guestId });

      expect(await send(bob, alice)).toEqual({
        ok: false,
        error: "recipient_blocked",
      });
      expect(alice.received).toEqual([]);
    });

    // A moderator has to be able to warn somebody who would rather not hear it.
    it("cannot stop a moderator", async () => {
      const { port } = await startServer({ authTokenSecret: SECRET });
      const token = signToken(
        { sub: 7, name: "Ada Mod", role: "moderator" },
        { secret: SECRET, ttlMs: 3_600_000 },
      );
      const ada = await inRoom({ token }, "general", port);
      const bob = await inRoom({ nickname: "Bob" }, "general", port);
      await emit(bob.socket, "dm:block", { guestId: ada.guestId });
      const heard = waitFor<DirectMessage>(bob.socket, "dm:new");

      await send(ada, bob, "this is a warning");

      expect((await heard).text).toBe("this is a warning");
    });

    it("does not tell a moderator that they were blocked, since it changes nothing for them", async () => {
      const { port } = await startServer({ authTokenSecret: SECRET });
      const token = signToken(
        { sub: 7, name: "Ada Mod", role: "moderator" },
        { secret: SECRET, ttlMs: 3_600_000 },
      );
      const ada = await inRoom({ token }, "general", port);
      const bob = await inRoom({ nickname: "Bob" }, "general", port);
      const heard: string[] = [];
      ada.socket.on("dm:blocked", () => heard.push("blocked"));

      await emit(bob.socket, "dm:block", { guestId: ada.guestId });
      await settle();

      expect(heard).toEqual([]);
    });

    it.each([
      ["nobody", {}],
      ["an empty id", { guestId: "" }],
      ["a number", { guestId: 5 }],
      ["a very long id", { guestId: "x".repeat(100) }],
    ])("refuses to block %s", async (_label, payload) => {
      const alice = await inRoom({ nickname: "Alice" });

      expect(await emit(alice.socket, "dm:block", payload)).toEqual({
        ok: false,
        error: "invalid_request",
      });
    });

    it("keeps the list of blocked people to a sensible size", async () => {
      const alice = await inRoom({ nickname: "Alice" });

      for (let n = 0; n < 100; n += 1) {
        await emit(alice.socket, "dm:block", { guestId: `guest-${n}` });
      }

      expect(
        await emit(alice.socket, "dm:block", { guestId: "one-too-many" }),
      ).toEqual({ ok: false, error: "too_many_blocked" });
      // Somebody already on the list can still be blocked again.
      expect(
        await emit(alice.socket, "dm:block", { guestId: "guest-3" }),
      ).toEqual({ ok: true });
    });
  });

  describe("limits", () => {
    it("shares the flood limit with room messages", async () => {
      const advance = clock();
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });

      for (let n = 0; n < 3; n += 1) {
        await emit(alice.socket, "message:send", { text: `room ${n}` });
      }
      await send(alice, bob, "one");
      await send(alice, bob, "two");
      advance(1_000);
      const refused = await send(alice, bob, "three");

      expect(refused).toEqual({
        ok: false,
        error: "rate_limited",
        retryAfterMs: RATE_WINDOW_MS - 1_000,
      });
    });

    it("lets them send again once the window has passed", async () => {
      const advance = clock();
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      for (let n = 0; n < 5; n += 1) await send(alice, bob);

      advance(RATE_WINDOW_MS);

      expect((await send(alice, bob)).ok).toBe(true);
    });

    it("does not count a message that was refused", async () => {
      const advance = clock();
      const alice = await inRoom({ nickname: "Alice" });
      const bob = await inRoom({ nickname: "Bob" });
      for (let n = 0; n < 4; n += 1) await send(alice, bob);
      await emit(alice.socket, "dm:send", {
        toGuestId: "nobody-here",
        text: "x",
      });
      await emit(alice.socket, "dm:send", { toGuestId: bob.guestId, text: "" });

      expect((await send(alice, bob)).ok).toBe(true);
      advance(0);
    });

    describe("new conversations", () => {
      const FLOOD_WINDOW_MS = 5_000;

      async function guests(count: number) {
        const people = [];
        for (let n = 0; n < count; n += 1) {
          people.push(await inRoom({ nickname: `Guest ${n}` }));
        }
        return people;
      }

      // Five messages fit in the flood window, so five conversations can be started at once.
      async function startFive(
        alice: Awaited<ReturnType<typeof inRoom>>,
        others: Awaited<ReturnType<typeof inRoom>>[],
      ) {
        for (const other of others.slice(0, 5)) {
          expect((await send(alice, other)).ok).toBe(true);
        }
      }

      it("allows five new conversations a minute, then says how long to wait", async () => {
        const advance = clock();
        const alice = await inRoom({ nickname: "Alice" });
        const others = await guests(6);
        await startFive(alice, others);

        advance(FLOOD_WINDOW_MS);
        const refused = await send(alice, others[5]);

        expect(refused).toEqual({
          ok: false,
          error: "rate_limited",
          retryAfterMs: 60_000 - FLOOD_WINDOW_MS,
        });
        expect(others[5].received).toEqual([]);
      });

      // Tested on the rule itself: moving the clock a whole minute would make the live connections time out.
      it("allows another once the oldest is a minute old", () => {
        const data = {
          recentMessageTimes: [],
          dmPartners: ["a", "b", "c", "d", "e"],
          dmStartTimes: [1_000, 1_001, 1_002, 1_003, 1_004],
        } as unknown as Parameters<typeof directMessageWaitMs>[0];

        expect(directMessageWaitMs(data, "f", 60_999)).toBe(1);
        expect(directMessageWaitMs(data, "f", 61_000)).toBe(0);
      });

      it("does not count more messages in a conversation already started", async () => {
        const advance = clock();
        const alice = await inRoom({ nickname: "Alice" });
        const others = await guests(5);
        await startFive(alice, others);

        advance(FLOOD_WINDOW_MS);

        expect((await send(alice, others[0], "and another")).ok).toBe(true);
      });

      it("does not count a message that never arrived", async () => {
        const advance = clock();
        const alice = await inRoom({ nickname: "Alice" });
        const others = await guests(6);
        for (let n = 0; n < 6; n += 1) {
          await emit(alice.socket, "dm:send", {
            toGuestId: `nobody-${n}`,
            text: "hi",
          });
        }

        await startFive(alice, others);
        advance(FLOOD_WINDOW_MS);

        // Exactly five counted: the sixth is the one refused.
        expect((await send(alice, others[5])).ok).toBe(false);
      });
    });
  });
});

describe("avatars", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";

  it.each(["male", "female", "trans", "other"])(
    "tells everyone the %s avatar a guest chose",
    async (avatar) => {
      const { session } = await connect({ nickname: "Alice", avatar });

      expect((await session)?.avatar).toBe(avatar);
    },
  );

  // Not worth refusing somebody over: they simply get the plain one.
  it.each([
    ["missing", undefined],
    ["unknown", "robot"],
    ["a number", 5],
    ["null", null],
    ["in other letters", "FEMALE"],
  ])(
    "gives a guest the plain avatar when theirs is %s",
    async (_label, avatar) => {
      const { session } = await connect({ nickname: "Alice", avatar });

      expect((await session)?.avatar).toBe("other");
    },
  );

  it("does not let a moderator pick one, whatever they send", async () => {
    const { port } = await startServer({ authTokenSecret: SECRET });
    const token = signToken(
      { sub: 7, name: "Ada Mod", role: "moderator" },
      { secret: SECRET, ttlMs: 3_600_000 },
    );

    const { session } = await connect({ token, avatar: "male" }, port);

    expect((await session)?.avatar).toBe("other");
  });

  it("shows each person's avatar in the room's list of members", async () => {
    const alice = await connect({ nickname: "Alice", avatar: "female" });
    const bob = await connect({ nickname: "Bob", avatar: "trans" });
    const seen = waitFor<Presence & { members: { avatar: string }[] }>(
      alice.socket!,
      "room:presence",
      (presence) => presence.members.length === 2,
    );

    await emit(alice.socket!, "room:join", { slug: "general" });
    await emit(bob.socket!, "room:join", { slug: "general" });

    expect(
      (await seen).members.map((member) => [member.nickname, member.avatar]),
    ).toEqual([
      ["Alice", "female"],
      ["Bob", "trans"],
    ]);
  });

  it("sends the author's avatar with a message, and keeps it with the stored copy", async () => {
    const alice = await connect({ nickname: "Alice", avatar: "male" });
    const bob = await connect({ nickname: "Bob" });
    await emit(alice.socket!, "room:join", { slug: "general" });
    await emit(bob.socket!, "room:join", { slug: "general" });
    const heard = waitFor<{ avatar: string }>(bob.socket!, "message:new");

    await emit(alice.socket!, "message:send", { text: "hi" });

    expect((await heard).avatar).toBe("male");
    expect(recordMessage).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: "male" }),
    );
  });

  it("sends both people's avatars with a direct message", async () => {
    const alice = await connect({ nickname: "Alice", avatar: "female" });
    const bob = await connect({ nickname: "Bob", avatar: "trans" });
    const aliceSession = await alice.session!;
    const bobSession = await bob.session!;
    await emit(alice.socket!, "room:join", { slug: "general" });
    await emit(bob.socket!, "room:join", { slug: "general" });
    const heard = waitFor<{ fromAvatar: string; toAvatar: string }>(
      bob.socket!,
      "dm:new",
    );

    await emit(alice.socket!, "dm:send", {
      toGuestId: bobSession.guestId,
      text: "hi",
    });

    expect(await heard).toMatchObject({
      fromAvatar: "female",
      toAvatar: "trans",
    });
    expect(aliceSession.avatar).toBe("female");
  });
});

describe("profiles", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";

  async function inGeneral(auth: Record<string, unknown>) {
    const { socket, session } = await connect(auth);
    await emit(socket!, "room:join", { slug: "general" });

    return { socket: socket!, session: await session! };
  }

  it("tells the guest the age they gave, and nothing when they gave none", async () => {
    expect(
      (await (await connect({ nickname: "Ann", age: 27 })).session!).age,
    ).toBe(27);
    expect(
      (await (await connect({ nickname: "Bea" })).session!).age,
    ).toBeUndefined();
  });

  it.each([
    ["too young", 17],
    ["too old", 121],
    ["a fraction", 20.5],
    ["text", "27"],
    ["null", null],
  ])("ignores an age that is %s", async (_label, age) => {
    const { session } = await connect({ nickname: "Ann", age });

    expect((await session)?.age).toBeUndefined();
  });

  it("shows each person's age to the others in the room, and only when it was given", async () => {
    const alice = await inGeneral({ nickname: "Alice", age: 30 });
    const bob = await connect({ nickname: "Bob" });
    const seen = waitFor<Presence & { members: { age?: number }[] }>(
      alice.socket,
      "room:presence",
      (presence) => presence.members.length === 2,
    );

    await emit(bob.socket!, "room:join", { slug: "general" });

    expect(
      (await seen).members.map((member) => [member.nickname, member.age]),
    ).toEqual([
      ["Alice", 30],
      ["Bob", undefined],
    ]);
  });

  it("changes the name, avatar and age, and tells the room", async () => {
    const alice = await inGeneral({ nickname: "Alice", avatar: "male" });
    const bob = await inGeneral({ nickname: "Bob" });
    const seen = waitFor<Presence & { members: { age?: number }[] }>(
      bob.socket,
      "room:presence",
      (presence) => presence.members.some((m) => m.nickname === "Alicia"),
    );

    const ack = await emit(alice.socket, "profile:update", {
      nickname: " Alicia ",
      avatar: "female",
      age: 31,
    });

    expect(ack).toEqual({
      ok: true,
      profile: { nickname: "Alicia", avatar: "female", age: 31 },
    });
    expect(
      (await seen).members.find((member) => member.nickname === "Alicia"),
    ).toMatchObject({ avatar: "female", age: 31 });
  });

  it("uses the new name and avatar for what the guest writes afterwards", async () => {
    const alice = await inGeneral({ nickname: "Alice" });
    const bob = await inGeneral({ nickname: "Bob" });
    await emit(alice.socket, "profile:update", {
      nickname: "Alicia",
      avatar: "trans",
    });
    const heard = waitFor<{ nickname: string; avatar: string }>(
      bob.socket,
      "message:new",
    );

    await emit(alice.socket, "message:send", { text: "hi" });

    expect(await heard).toMatchObject({ nickname: "Alicia", avatar: "trans" });
  });

  it("only changes what is in the payload, and takes the age back with null", async () => {
    const alice = await inGeneral({
      nickname: "Alice",
      avatar: "male",
      age: 40,
    });

    expect(
      await emit(alice.socket, "profile:update", { avatar: "other" }),
    ).toEqual({
      ok: true,
      profile: { nickname: "Alice", avatar: "other", age: 40 },
    });
    expect(await emit(alice.socket, "profile:update", { age: null })).toEqual({
      ok: true,
      profile: { nickname: "Alice", avatar: "other" },
    });
  });

  it.each([
    ["a nickname that is too short", { nickname: "A" }, "invalid_nickname"],
    ["a nickname that is not text", { nickname: 5 }, "invalid_nickname"],
    ["an unknown avatar", { avatar: "robot" }, "invalid_profile"],
    ["an age that is too young", { age: 17 }, "invalid_profile"],
    ["an age that is text", { age: "30" }, "invalid_profile"],
  ])("refuses %s and changes nothing", async (_label, payload, error) => {
    const alice = await inGeneral({ nickname: "Alice", age: 30 });

    expect(
      await emit(alice.socket, "profile:update", {
        ...payload,
        avatar: (payload as { avatar?: string }).avatar ?? "female",
      }),
    ).toEqual({ ok: false, error });
    expect(await emit(alice.socket, "profile:update", {})).toEqual({
      ok: true,
      profile: { nickname: "Alice", avatar: "other", age: 30 },
    });
  });

  it("refuses a name that looks like a moderator's", async () => {
    getModeratorNames.mockResolvedValue(["Ada Mod"]);
    const alice = await inGeneral({ nickname: "Alice" });

    expect(
      await emit(alice.socket, "profile:update", { nickname: "ada  mod" }),
    ).toEqual({ ok: false, error: "reserved_nickname" });
  });

  it("limits how often the profile can be changed", async () => {
    const alice = await inGeneral({ nickname: "Alice" });

    for (let n = 0; n < 5; n++) {
      expect(
        (await emit(alice.socket, "profile:update", { age: 20 + n })).ok,
      ).toBe(true);
    }

    expect(
      await emit(alice.socket, "profile:update", { age: 30 }),
    ).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("does not let a moderator change theirs", async () => {
    const { port } = await startServer({ authTokenSecret: SECRET });
    const token = signToken(
      { sub: 7, name: "Ada Mod", role: "moderator" },
      { secret: SECRET, ttlMs: 3_600_000 },
    );
    const { socket } = await connect({ token }, port);

    expect(
      await emit(socket!, "profile:update", { nickname: "Somebody" }),
    ).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("nicknames in a room", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";

  async function guestIn(nickname: string, slug = "general") {
    const { socket, session } = await connect({ nickname });
    const ack = await emit(socket!, "room:join", { slug });

    return { socket: socket!, session: await session!, ack };
  }

  it("refuses a name somebody else in the room already has", async () => {
    await guestIn("Alice");
    const second = await connect({ nickname: "Alice" });

    expect(
      await emit(second.socket!, "room:join", { slug: "general" }),
    ).toEqual({ ok: false, error: "nickname_taken" });
  });

  it.each(["alice", "ALICE", "a l i c e", "Al.ice", "A_l-i_c-e"])(
    "does not tell %s from Alice",
    async (name) => {
      await guestIn("Alice");
      const second = await connect({ nickname: name });

      expect(
        (await emit(second.socket!, "room:join", { slug: "general" })).error,
      ).toBe("nickname_taken");
    },
  );

  it("does not put the refused guest in the room", async () => {
    const first = await guestIn("Alice");
    const second = await connect({ nickname: "Alice" });
    await emit(second.socket!, "room:join", { slug: "general" });
    const heard = vi.fn();
    first.socket.on("message:new", heard);

    await emit(second.socket!, "message:send", { text: "hi" });

    expect(
      await emit(second.socket!, "message:send", { text: "hi" }),
    ).toMatchObject({ ok: false, error: "not_in_room" });
    expect(heard).not.toHaveBeenCalled();
  });

  it("lets the same name be used in another room", async () => {
    await guestIn("Alice", "general");

    expect((await guestIn("Alice", "random")).ack.ok).toBe(true);
  });

  it("frees the name when its owner leaves", async () => {
    const first = await guestIn("Alice");
    await emit(first.socket, "room:leave");

    expect((await guestIn("Alice")).ack.ok).toBe(true);
  });

  it("does not count a guest who joins their own room again", async () => {
    const first = await guestIn("Alice");

    expect(
      await emit(first.socket, "room:join", { slug: "general" }),
    ).toMatchObject({ ok: true });
  });

  it("lets a guest who resumes their identity back in while the old connection lingers", async () => {
    verifyResume.mockResolvedValue(true);
    const first = await guestIn("Alice");
    const again = await connect({
      nickname: "Alice",
      guestId: first.session.guestId,
      resumeSecret: "the-secret",
    });

    expect(
      (await emit(again.socket!, "room:join", { slug: "general" })).ok,
    ).toBe(true);
  });

  it("refuses a rename to a name in the room, and changes nothing", async () => {
    const alice = await guestIn("Alice");
    await guestIn("Bob");

    expect(
      await emit(alice.socket, "profile:update", { nickname: "bob" }),
    ).toEqual({ ok: false, error: "nickname_taken" });
    expect(await emit(alice.socket, "profile:update", {})).toMatchObject({
      ok: true,
      profile: { nickname: "Alice" },
    });
  });

  it("lets a guest change the look of their own name, and take a name that is free", async () => {
    const alice = await guestIn("Alice");
    await guestIn("Bob");

    expect(
      (await emit(alice.socket, "profile:update", { nickname: "ALICE" })).ok,
    ).toBe(true);
    expect(
      await emit(alice.socket, "profile:update", { nickname: "Alicia" }),
    ).toMatchObject({ ok: true, profile: { nickname: "Alicia" } });
  });

  it("lets a guest take the name another guest has just left", async () => {
    const alice = await guestIn("Alice");
    const bob = await guestIn("Bob");
    await emit(bob.socket, "room:leave");

    expect(
      (await emit(alice.socket, "profile:update", { nickname: "Bob" })).ok,
    ).toBe(true);
  });

  it("lets only one of two guests who choose the same name at once have it", async () => {
    const alice = await guestIn("Alice");
    const bob = await guestIn("Bob");

    const results = await Promise.all([
      emit(alice.socket, "profile:update", { nickname: "Carol" }),
      emit(bob.socket, "profile:update", { nickname: "carol" }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => result.error === "nickname_taken"),
    ).toHaveLength(1);
  });

  it("does not count the same moderator account on two connections as two people", async () => {
    const { port } = await startServer({ authTokenSecret: SECRET });
    const token = signToken(
      { sub: 7, name: "Ada Mod", role: "moderator" },
      { secret: SECRET, ttlMs: 3_600_000 },
    );
    const first = await connect({ token }, port);
    const second = await connect({ token }, port);
    await emit(first.socket!, "room:join", { slug: "general" });

    expect(
      (await emit(second.socket!, "room:join", { slug: "general" })).ok,
    ).toBe(true);
  });
});

describe("resuming an identity", () => {
  const SECRET = "a-secret-that-is-long-enough-for-tests";

  it("gives each connection a secret for resuming, remembered by the server", async () => {
    const { session } = await connect({ nickname: "Alice" });
    const { guestId, resumeSecret } = (await session)!;

    expect(resumeSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(rememberResume).toHaveBeenCalledWith(guestId, resumeSecret);
  });

  it("gives every connection its own secret", async () => {
    const first = await (await connect({ nickname: "Alice" })).session!;
    const second = await (await connect({ nickname: "Bob" })).session!;

    expect(first.resumeSecret).not.toBe(second.resumeSecret);
  });

  it("gives a connection that resumes a new secret, so the one it presented is spent", async () => {
    verifyResume.mockResolvedValue(true);

    const { session } = await connect({
      nickname: "Alice",
      guestId: "guest-before",
      resumeSecret: "the-secret",
    });

    const { resumeSecret } = (await session)!;
    expect(resumeSecret).not.toBe("the-secret");
    expect(resumeSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(rememberResume).toHaveBeenCalledWith("guest-before", resumeSecret);
  });

  it("never shows the secret to anybody else", async () => {
    const alice = await connect({ nickname: "Alice" });
    const bob = await connect({ nickname: "Bob" });
    const aliceSession = await alice.session!;
    const seen = waitFor<Presence>(
      bob.socket!,
      "room:presence",
      (presence) => presence.members.length === 2,
    );
    await emit(alice.socket!, "room:join", { slug: "general" });
    await emit(bob.socket!, "room:join", { slug: "general" });

    const everything = JSON.stringify(await seen);

    expect(everything).not.toContain(aliceSession.resumeSecret!);
    expect(everything).not.toContain("resumeSecret");
  });

  it("lets a new connection take over a guest id with the right secret", async () => {
    verifyResume.mockResolvedValue(true);

    const { session } = await connect({
      nickname: "Alice",
      guestId: "guest-before",
      resumeSecret: "the-secret",
    });

    expect((await session)?.guestId).toBe("guest-before");
    expect(verifyResume).toHaveBeenCalledWith("guest-before", "the-secret");
  });

  it("gives a connection a new id of its own when the secret is not right", async () => {
    verifyResume.mockResolvedValue(false);

    const { session } = await connect({
      nickname: "Alice",
      guestId: "guest-before",
      resumeSecret: "wrong",
    });

    const { guestId } = (await session)!;
    expect(guestId).not.toBe("guest-before");
    expect(guestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ["no id", { resumeSecret: "s" }],
    ["no secret", { guestId: "guest-before" }],
    ["numbers", { guestId: 5, resumeSecret: 6 }],
    ["empty text", { guestId: "", resumeSecret: "" }],
  ])("does not try to resume with %s", async (_label, extra) => {
    const { session } = await connect({ nickname: "Alice", ...extra });

    expect((await session)?.guestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(verifyResume).not.toHaveBeenCalled();
  });

  it("turns the connection away when the store cannot be read, rather than guessing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    verifyResume.mockRejectedValue(new Error("redis down"));

    const { error } = await connect({
      nickname: "Alice",
      guestId: "guest-before",
      resumeSecret: "s",
    });

    expect(error).toBe("unavailable");
  });

  it("turns the connection away when the new secret cannot be kept", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rememberResume.mockRejectedValue(new Error("redis down"));

    expect((await connect({ nickname: "Alice" })).error).toBe("unavailable");
  });

  it("keeps the nickname and avatar the new connection asks for, not the old ones", async () => {
    verifyResume.mockResolvedValue(true);

    const { session } = await connect({
      nickname: "Alice the Second",
      avatar: "female",
      guestId: "guest-before",
      resumeSecret: "s",
    });

    expect(await session).toMatchObject({
      guestId: "guest-before",
      nickname: "Alice the Second",
      avatar: "female",
    });
  });

  describe("when the old connection is still there", () => {
    it("removes it, telling it why, so the guest is only in the room once", async () => {
      verifyResume.mockResolvedValue(true);
      const old = await connect({
        nickname: "Alice",
        guestId: "guest-before",
        resumeSecret: "s",
      });
      await emit(old.socket!, "room:join", { slug: "general" });
      const kicked = waitFor<{ reason: string }>(old.socket!, "kicked");
      const gone = new Promise((resolve) =>
        old.socket!.once("disconnect", resolve),
      );

      const next = await connect({
        nickname: "Alice",
        guestId: "guest-before",
        resumeSecret: "s",
      });
      await emit(next.socket!, "room:join", { slug: "general" });

      expect(await kicked).toEqual({ reason: "replaced" });
      await gone;
      const members = (await ioServer.fetchSockets()).filter(
        (socket) => socket.data.guestId === "guest-before",
      );
      expect(members).toHaveLength(1);
    });

    it("tells the room the guest left and came back", async () => {
      verifyResume.mockResolvedValue(true);
      const bob = await connect({ nickname: "Bob" });
      await emit(bob.socket!, "room:join", { slug: "general" });
      const old = await connect({
        nickname: "Alice",
        guestId: "guest-before",
        resumeSecret: "s",
      });
      await emit(old.socket!, "room:join", { slug: "general" });
      const lists: string[][] = [];
      bob.socket!.on("room:presence", (presence: Presence) =>
        lists.push(presence.members.map((member) => member.guestId)),
      );

      const next = await connect({
        nickname: "Alice",
        guestId: "guest-before",
        resumeSecret: "s",
      });
      await emit(next.socket!, "room:join", { slug: "general" });

      await vi.waitFor(() => {
        expect(lists.some((list) => !list.includes("guest-before"))).toBe(true);
        expect(lists.at(-1)).toContain("guest-before");
      });
    });
  });

  it("lets a moderator resume too, with the name from their account", async () => {
    verifyResume.mockResolvedValue(true);
    const { port } = await startServer({ authTokenSecret: SECRET });
    const token = signToken(
      { sub: 7, name: "Ada Mod", role: "moderator" },
      { secret: SECRET, ttlMs: 3_600_000 },
    );

    const { session } = await connect(
      { token, guestId: "guest-before", resumeSecret: "s" },
      port,
    );

    expect(await session).toMatchObject({
      guestId: "guest-before",
      nickname: "Ada Mod",
      role: "moderator",
    });
  });
});
