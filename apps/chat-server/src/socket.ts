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

function stringField(payload: unknown, field: string): string {
  const value = (payload as Record<string, unknown> | null | undefined)?.[
    field
  ];
  return typeof value === "string" ? value : "";
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  io.adapter(createAdapter(pubClient, subClient));

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

    socket.on("room:join", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const slug = stringField(payload, "slug");

      const room = (await getCachedPublicRooms()).find(
        (candidate) => candidate.slug === slug,
      );

      if (!room) {
        return reply({ ok: false, error: "room_not_found" });
      }

      if (data.roomSlug === slug) {
        return reply({ ok: true, roomSlug: slug });
      }

      // Not atomic across simultaneous joins; acceptable until real load needs a Redis-side counter.
      const members = await io.in(roomKey(slug)).fetchSockets();

      if (members.length >= room.maxMembers) {
        return reply({ ok: false, error: "room_full" });
      }

      await leaveRoom();
      data.roomSlug = slug;
      await socket.join(roomKey(slug));
      await emitPresence(slug);

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
