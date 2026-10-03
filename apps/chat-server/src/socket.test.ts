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
} = vi.hoisted(() => ({
  isBanned: vi.fn(),
  getCachedPublicRooms: vi.fn(),
  recordMessage: vi.fn(),
  getHistory: vi.fn(),
  redactMessagesFrom: vi.fn(),
}));

vi.mock("./redis.js", () => ({ pubClient: {}, subClient: {} }));
vi.mock("./bans.js", () => ({ isBanned }));
vi.mock("./rooms.js", () => ({ getCachedPublicRooms }));
vi.mock("./history.js", () => ({
  recordMessage,
  getHistory,
  redactMessagesFrom,
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

const { createSocketServer, enforceBans } = await import("./socket.js");
const { hashIdentifier } = await import("./identity.js");

type Ack = { ok: boolean; error?: string; [key: string]: unknown };
type Presence = {
  roomSlug: string;
  members: { guestId: string; nickname: string }[];
};

const ROOMS = [
  { id: 1, name: "General", slug: "general", maxMembers: 10 },
  { id: 2, name: "Random", slug: "random", maxMembers: 10 },
  { id: 3, name: "Tiny", slug: "tiny", maxMembers: 1 },
  // Payload returns null for a room whose limit field was left empty.
  { id: 4, name: "Open", slug: "open", maxMembers: null },
];

let ioServer: Server;
let port: number;
let clients: Socket[] = [];
const extraServers: Server[] = [];

type Session = { guestId: string; nickname: string };

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
    ["too long", "x".repeat(1001)],
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
      (await emit(alice, "message:send", { text: "x".repeat(1000) })).ok,
    ).toBe(true);
  });

  it("rate limits after 5 messages in the window", async () => {
    const alice = await connectGuest("Alice");
    await emit(alice, "room:join", { slug: "general" });

    for (let i = 0; i < 5; i++) {
      expect((await emit(alice, "message:send", { text: `m${i}` })).ok).toBe(
        true,
      );
    }

    expect(await emit(alice, "message:send", { text: "one too many" })).toEqual(
      {
        ok: false,
        error: "rate_limited",
      },
    );
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
      ["general", "open", "random", "tiny"],
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

describe("connections per IP", () => {
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
