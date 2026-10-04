import crypto from "crypto";
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

import { isBanned } from "./bans.js";
import { env } from "./env.js";
import { getHistory, recordMessage, redactMessagesFrom } from "./history.js";
import { hashIdentifier, getClientIp, validateNickname } from "./identity.js";
import { pubClient, subClient } from "./redis.js";
import { getCachedPublicRooms } from "./rooms.js";

const MAX_MESSAGE_LENGTH = 1000;
const RATE_LIMIT_MAX_MESSAGES = 5;
const RATE_LIMIT_WINDOW_MS = 5_000;

interface SocketData {
  guestId: string;
  nickname: string;
  ipHash: string;
  // Set when a ban removes the guest, so a message still being recorded at that moment is dropped.
  banned?: boolean;
  roomSlug?: string;
  recentMessageTimes: number[];
  // When this guest last got a message through, for slow mode.
  lastMessageAt?: number;
}

type Ack = (
  response:
    | { ok: true; [key: string]: unknown }
    | { ok: false; error: string; retryAfterMs?: number },
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
  options: {
    inactivityTimeoutMs?: number;
    maxConnectionsPerIp?: number;
    trustedProxyHops?: number;
  } = {},
): Server {
  const inactivityTimeoutMs =
    options.inactivityTimeoutMs ?? env.INACTIVITY_TIMEOUT_MS;
  // Undefined means no cap.
  const maxConnectionsPerIp =
    options.maxConnectionsPerIp ?? env.MAX_CONNECTIONS_PER_IP;
  const trustedProxyHops = options.trustedProxyHops ?? env.TRUST_PROXY_HOPS;
  // Live connections per hashed IP on this process; with several nodes the cap applies to each separately.
  const connectionsPerIp = new Map<string, number>();
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

    const ipHash = hashIdentifier(
      getClientIp(socket.handshake, trustedProxyHops),
    );

    try {
      if (await isBanned(ipHash)) {
        return next(new Error("banned"));
      }
    } catch (error) {
      console.error("Ban check failed:", error);
      return next(new Error("unavailable"));
    }

    // Everything from here to next() is synchronous. The guest may have left during the ban check above; if so
    // Socket.IO never emits "connection", so a slot reserved now would never be released.
    if (socket.client.conn.readyState !== "open") {
      return next(new Error("closed"));
    }

    if (maxConnectionsPerIp !== undefined) {
      const current = connectionsPerIp.get(ipHash) ?? 0;

      if (current >= maxConnectionsPerIp) {
        return next(new Error("too_many_connections"));
      }

      connectionsPerIp.set(ipHash, current + 1);
    }

    socket.data = {
      guestId: crypto.randomUUID(),
      nickname,
      ipHash,
      recentMessageTimes: [],
    } satisfies SocketData;
    next();
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;

    // First, so the slot reserved in the middleware is always given back.
    socket.on("disconnect", () => {
      if (maxConnectionsPerIp === undefined) return;

      const remaining = (connectionsPerIp.get(data.ipHash) ?? 1) - 1;
      if (remaining > 0) connectionsPerIp.set(data.ipHash, remaining);
      else connectionsPerIp.delete(data.ipHash);
    });

    async function leaveRoom(): Promise<void> {
      const slug = data.roomSlug;
      if (!slug) return;

      data.roomSlug = undefined;
      await socket.leave(roomKey(slug));
      await emitPresence(slug);
    }

    socket.emit("session", { guestId: data.guestId, nickname: data.nickname });

    // Any client event counts as activity.
    let idleTimer: NodeJS.Timeout | undefined;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        socket.emit("kicked", { reason: "inactivity" });
        socket.disconnect(true);
      }, inactivityTimeoutMs);
    };

    resetIdleTimer();
    socket.onAny(resetIdleTimer);

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

        const limit = room.maxMembers;

        // Rooms without a limit skip the cluster-wide member lookup entirely.
        if (typeof limit === "number") {
          const members = await io.in(roomKey(slug)).fetchSockets();
          if (members.length >= limit) return "room_full" as const;
        }

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

      // Read after joining, so a message sent in between is in the history, delivered live, or both (the client
      // removes the duplicate by id), but never neither.
      const history = await getHistory(slug).catch((error) => {
        console.error("Failed to read room history:", error);
        return [];
      });

      reply({ ok: true, roomSlug: slug, history });
    });

    socket.on("room:leave", async (_payload: unknown, ack?: Ack) => {
      await leaveRoom();
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("message:send", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const text = stringField(payload, "text").trim();

      const slug = data.roomSlug;

      if (!slug) {
        return reply({ ok: false, error: "not_in_room" });
      }

      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        return reply({ ok: false, error: "invalid_message" });
      }

      let slowModeMs = 0;

      try {
        const room = (await getCachedPublicRooms()).find(
          (candidate) => candidate.slug === slug,
        );
        slowModeMs = (room?.slowModeSeconds ?? 0) * 1000;
      } catch (error) {
        console.error("Failed to read the room's settings:", error);
        return reply({ ok: false, error: "unavailable" });
      }

      // Everything from here to the end of the check is synchronous, so two messages sent back to back cannot
      // both pass it.
      const now = Date.now();
      data.recentMessageTimes = data.recentMessageTimes.filter(
        (time) => now - time < RATE_LIMIT_WINDOW_MS,
      );

      // The general flood limit always applies; slow mode adds a longer wait that follows the guest between rooms,
      // so hopping from room to room is no way round it.
      const waitMs = Math.max(
        data.recentMessageTimes.length >= RATE_LIMIT_MAX_MESSAGES
          ? data.recentMessageTimes[0] + RATE_LIMIT_WINDOW_MS - now
          : 0,
        slowModeMs > 0 && data.lastMessageAt !== undefined
          ? data.lastMessageAt + slowModeMs - now
          : 0,
      );

      if (waitMs > 0) {
        return reply({
          ok: false,
          error: "rate_limited",
          retryAfterMs: waitMs,
        });
      }

      data.recentMessageTimes.push(now);
      data.lastMessageAt = now;

      const message = {
        id: crypto.randomUUID(),
        roomSlug: slug,
        guestId: data.guestId,
        nickname: data.nickname,
        text,
        sentAt: new Date(now).toISOString(),
      };

      // Recorded before it is delivered, so whatever a guest has seen live is also in the history a later joiner
      // reads. The stored copy also names the sender's IP hash so a later ban can reach it; that never leaves the
      // server. A Redis failure costs the history entry, not the message.
      try {
        await recordMessage({ ...message, ipHash: data.ipHash });
      } catch (error) {
        console.error("Failed to record message:", error);
      }

      // A ban can land while the message is being recorded: it is neither delivered nor left in the history.
      if (data.banned) {
        await redactMessagesFrom(message.roomSlug, [data.ipHash]).catch(
          (error) =>
            console.error("Failed to replace a banned guest's message:", error),
        );
        return reply({ ok: false, error: "banned" });
      }

      io.to(roomKey(message.roomSlug)).emit("message:new", message);

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

// Makes a ban reach what is already in the chat: guests of this node who are banned are disconnected, and their
// remembered messages are replaced with placeholders that the rest of the room is told about. Every node runs this
// for its own guests; replacing in Redis is atomic, so whichever node gets there first reports the stored ids.
export async function enforceBans(
  io: Server,
  bannedHashes: string[],
): Promise<void> {
  if (bannedHashes.length === 0) return;

  const banned = new Set(bannedHashes);
  const removedGuestsByRoom = new Map<string, string[]>();

  for (const socket of io.sockets.sockets.values()) {
    const data = socket.data as SocketData;
    if (!banned.has(data.ipHash)) continue;

    if (data.roomSlug) {
      removedGuestsByRoom.set(data.roomSlug, [
        ...(removedGuestsByRoom.get(data.roomSlug) ?? []),
        data.guestId,
      ]);
    }

    data.banned = true;
    socket.emit("kicked", { reason: "banned" });
    socket.disconnect(true);
  }

  for (const room of await getCachedPublicRooms()) {
    try {
      const ids = await redactMessagesFrom(room.slug, bannedHashes);
      // Their older messages may still be on screens although the history no longer holds them.
      const guestIds = removedGuestsByRoom.get(room.slug) ?? [];

      if (ids.length > 0 || guestIds.length > 0) {
        io.to(roomKey(room.slug)).emit("message:redacted", {
          roomSlug: room.slug,
          ids,
          guestIds,
        });
      }
    } catch (error) {
      console.error(`Failed to replace messages in ${room.slug}:`, error);
    }
  }
}
