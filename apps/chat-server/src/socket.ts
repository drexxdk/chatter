import crypto from "crypto";
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

import { isBanned } from "./bans.js";
import { env } from "./env.js";
import { hashIdentifier, validateNickname } from "./identity.js";
import { pubClient, subClient } from "./redis.js";
import { getCachedPublicRooms } from "./rooms.js";

const MAX_MESSAGE_LENGTH = 1000;
const RATE_LIMIT_MAX_MESSAGES = 5;
const RATE_LIMIT_WINDOW_MS = 5_000;

interface SocketData {
  guestId: string;
  nickname: string;
  roomSlug?: string;
  recentMessageTimes: number[];
}

type Ack = (
  response: { ok: true; [key: string]: unknown } | { ok: false; error: string },
) => void;

const roomKey = (slug: string) => `room:${slug}`;

// Runs tasks for the same room one at a time so a capacity check and the join that follows can't interleave.
// Only covers this process; multiple nodes would need a Redis-side counter.
const roomLocks = new Map<string, Promise<void>>();

function withRoomLock<T>(slug: string, task: () => Promise<T>): Promise<T> {
  const result = (roomLocks.get(slug) ?? Promise.resolve()).then(task);
  const tail = result.then(
    () => {},
    () => {},
  );

  roomLocks.set(slug, tail);
  void tail.then(() => {
    if (roomLocks.get(slug) === tail) roomLocks.delete(slug);
  });

  return result;
}

function stringField(payload: unknown, field: string): string {
  const value = (payload as Record<string, unknown> | null | undefined)?.[
    field
  ];
  return typeof value === "string" ? value : "";
}

export function createSocketServer(
  httpServer: HttpServer,
  options: { inactivityTimeoutMs?: number } = {},
): Server {
  const inactivityTimeoutMs =
    options.inactivityTimeoutMs ?? env.INACTIVITY_TIMEOUT_MS;
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  io.adapter(
    createAdapter(pubClient, subClient, { key: env.SOCKET_ADAPTER_KEY }),
  );

  async function emitPresence(slug: string): Promise<void> {
    const members = await io.in(roomKey(slug)).fetchSockets();

    io.to(roomKey(slug)).emit("room:presence", {
      roomSlug: slug,
      members: members.map((member) => ({
        guestId: (member.data as SocketData).guestId,
        nickname: (member.data as SocketData).nickname,
      })),
    });
  }

  // Guest auth + ban check run before the connection is accepted; fails closed if the ban cache is unreachable.
  io.use(async (socket, next) => {
    const nickname = validateNickname(socket.handshake.auth?.nickname);

    if (!nickname) {
      return next(new Error("invalid_nickname"));
    }

    try {
      if (await isBanned(hashIdentifier(socket.handshake.address))) {
        return next(new Error("banned"));
      }
    } catch (error) {
      console.error("Ban check failed:", error);
      return next(new Error("unavailable"));
    }

    socket.data = {
      guestId: crypto.randomUUID(),
      nickname,
      recentMessageTimes: [],
    } satisfies SocketData;
    next();
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;

    async function leaveRoom(): Promise<void> {
      const slug = data.roomSlug;
      if (!slug) return;

      data.roomSlug = undefined;
      await socket.leave(roomKey(slug));
      await emitPresence(slug);
    }

    socket.emit("session", { guestId: data.guestId, nickname: data.nickname });

    // Any client event counts as activity. A non-positive timeout disables the check.
    let idleTimer: NodeJS.Timeout | undefined;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        socket.emit("kicked", { reason: "inactivity" });
        socket.disconnect(true);
      }, inactivityTimeoutMs);
    };

    if (Number.isFinite(inactivityTimeoutMs) && inactivityTimeoutMs > 0) {
      resetIdleTimer();
      socket.onAny(resetIdleTimer);
    }

    socket.on("room:join", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const slug = stringField(payload, "slug");

      const room = (await getCachedPublicRooms()).find(
        (candidate) => candidate.slug === slug,
      );

      if (!room) {
        return reply({ ok: false, error: "room_not_found" });
      }

      const outcome = await withRoomLock(slug, async () => {
        if (socket.disconnected) return "disconnected" as const;
        if (data.roomSlug === slug) return "already_joined" as const;

        const members = await io.in(roomKey(slug)).fetchSockets();
        if (members.length >= room.maxMembers) return "room_full" as const;

        await leaveRoom();
        data.roomSlug = slug;
        await socket.join(roomKey(slug));
        return "joined" as const;
      });

      if (outcome === "room_full") {
        return reply({ ok: false, error: "room_full" });
      }

      if (outcome === "joined") {
        await emitPresence(slug);
      }

      reply({ ok: true, roomSlug: slug });
    });

    socket.on("room:leave", async (_payload: unknown, ack?: Ack) => {
      await leaveRoom();
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("message:send", (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const text = stringField(payload, "text").trim();

      if (!data.roomSlug) {
        return reply({ ok: false, error: "not_in_room" });
      }

      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        return reply({ ok: false, error: "invalid_message" });
      }

      const now = Date.now();
      data.recentMessageTimes = data.recentMessageTimes.filter(
        (time) => now - time < RATE_LIMIT_WINDOW_MS,
      );

      if (data.recentMessageTimes.length >= RATE_LIMIT_MAX_MESSAGES) {
        return reply({ ok: false, error: "rate_limited" });
      }

      data.recentMessageTimes.push(now);

      io.to(roomKey(data.roomSlug)).emit("message:new", {
        id: crypto.randomUUID(),
        roomSlug: data.roomSlug,
        guestId: data.guestId,
        nickname: data.nickname,
        text,
        sentAt: new Date(now).toISOString(),
      });

      reply({ ok: true });
    });

    socket.on("disconnect", () => {
      clearTimeout(idleTimer);

      // Socket.IO has already removed the socket from its rooms; just refresh presence for the others.
      if (data.roomSlug) {
        emitPresence(data.roomSlug).catch((error) =>
          console.error("Presence update failed:", error),
        );
      }
    });
  });

  return io;
}
