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

const { isBanned, getCachedPublicRooms } = vi.hoisted(() => ({
  isBanned: vi.fn(),
  getCachedPublicRooms: vi.fn(),
}));

vi.mock("./redis.js", () => ({ pubClient: {}, subClient: {} }));
vi.mock("./bans.js", () => ({ isBanned }));
vi.mock("./rooms.js", () => ({ getCachedPublicRooms }));
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

const { createSocketServer } = await import("./socket.js");

type Ack = { ok: boolean; error?: string; [key: string]: unknown };
type Presence = {
  roomSlug: string;
  members: { guestId: string; nickname: string }[];
};

const ROOMS = [
  { id: 1, name: "General", slug: "general", maxMembers: 10 },
  { id: 2, name: "Random", slug: "random", maxMembers: 10 },
  { id: 3, name: "Tiny", slug: "tiny", maxMembers: 1 },
];

let ioServer: Server;
let port: number;
let clients: Socket[] = [];

type Session = { guestId: string; nickname: string };

function connect(
  auth: Record<string, unknown>,
  targetPort: number = port,
): Promise<{ socket?: Socket; session?: Promise<Session>; error?: string }> {
  return new Promise((resolve) => {
    const socket = connectClient(`http://localhost:${targetPort}`, {
      auth,
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
): Promise<Socket> {
  const { socket } = await connect({ nickname }, targetPort);
  if (!socket) throw new Error(`Guest ${nickname} failed to connect`);
  return socket;
}

async function startServer(options?: { inactivityTimeoutMs?: number }) {
  const server = http.createServer();
  const io = createSocketServer(server, options);
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
  await ioServer.close();
});

beforeEach(() => {
  isBanned.mockReset().mockResolvedValue(false);
  getCachedPublicRooms.mockReset().mockResolvedValue(ROOMS);
});

afterEach(async () => {
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
    const disconnected = new Promise((resolve) => idle.once("disconnect", resolve));

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
