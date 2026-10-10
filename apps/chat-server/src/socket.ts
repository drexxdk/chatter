import crypto from "crypto";
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

import { parseAge } from "./age.js";
import { avatarSchema, parseAvatar, type Avatar } from "./avatars.js";
import { isBanned } from "./bans.js";
import {
  claimAnnouncementSlot,
  getLatestAnnouncement,
  saveAnnouncement,
  type Announcement,
} from "./announcements.js";
import { env } from "./env.js";
import {
  getHistory,
  recordMessage,
  redactMessagesFrom,
  toggleReaction,
} from "./history.js";
import { hashIdentifier, getClientIp, validateNickname } from "./identity.js";
import { MAX_MESSAGE_LENGTH } from "./limits.js";
import {
  getModerators,
  getModeratorNames,
  isReservedNickname,
  normalizeName,
} from "./names.js";
import { isReactionEmoji } from "./reactions.js";
import { pubClient, subClient } from "./redis.js";
import { ROLE_RULES, type ChatRole } from "./roles.js";
import { getCachedPublicRooms } from "./rooms.js";
import { newResumeSecret, rememberResume, verifyResume } from "./resume.js";
import { verifyToken } from "./tokens.js";

// The largest packet a client may send; a longer one closes its connection. The default is 1 MB, while the biggest
// thing a client sends is a 500-character message (3 KB even if every character had to be escaped in JSON).
const MAX_PACKET_BYTES = 8 * 1024;
// How often the server pings a client, and how long it waits for the answer before dropping the connection (these
// are Socket.IO's defaults, set here so that a change of library version cannot change them unnoticed).
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 20_000;
const MAX_ANNOUNCEMENT_LENGTH = 500;
const RATE_LIMIT_MAX_MESSAGES = 5;
const RATE_LIMIT_WINDOW_MS = 5_000;
// Starting a conversation reaches somebody new, so it is limited more tightly than messages in one already going.
const NEW_CONVERSATIONS_PER_WINDOW = 5;
const NEW_CONVERSATION_WINDOW_MS = 60_000;
// Bounds what one connection can make the server remember.
const MAX_BLOCKED = 100;
const MAX_REMEMBERED_PARTNERS = 200;
const MAX_GUEST_ID_LENGTH = 64;
// Changing the name or the profile shows up for everybody in the room, so it is limited like starting conversations.
const PROFILE_CHANGES_PER_WINDOW = 5;
const PROFILE_CHANGE_WINDOW_MS = 60_000;
// Reactions are cheap, but each one is rewritten into Redis and shown to the whole room.
const REACTIONS_PER_WINDOW = 10;
const REACTION_WINDOW_MS = 5_000;

interface SocketData {
  guestId: string;
  nickname: string;
  role: ChatRole;
  avatar: Avatar;
  // Only when the guest said how old they are.
  age?: number;
  // The Payload account behind a signed-in role; guests have none.
  accountId?: number;
  ipHash: string;
  // Set when a ban removes the guest, so a message still being recorded at that moment is dropped.
  banned?: boolean;
  roomSlug?: string;
  recentMessageTimes: number[];
  // When the guest last changed their profile, for the limit on that.
  profileChangeTimes: number[];
  // When the guest last reacted to a message, for the limit on that.
  reactionTimes: number[];
  // Whose direct messages this connection does not want. Arrays, because the data is copied between nodes as JSON.
  blockedGuestIds: string[];
  // Who this connection has messaged, and when it started those conversations, for the new-conversation limit.
  dmPartners: string[];
  dmStartTimes: number[];
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

// A message may run over several lines, but a run of blank ones would only make it tall: more than one in a row is
// cut to one.
function messageText(payload: unknown): string {
  return stringField(payload, "text")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Milliseconds until this connection may send another message of any kind; 0 when it may now. Messages in rooms and
// direct messages count together.
function floodWaitMs(data: SocketData, now: number): number {
  data.recentMessageTimes = data.recentMessageTimes.filter(
    (time) => now - time < RATE_LIMIT_WINDOW_MS,
  );

  return data.recentMessageTimes.length >= RATE_LIMIT_MAX_MESSAGES
    ? (data.recentMessageTimes[0] ?? now) + RATE_LIMIT_WINDOW_MS - now
    : 0;
}

// The flood limit, plus the limit on starting conversations when this one is new to the sender.
export function directMessageWaitMs(
  data: SocketData,
  toGuestId: string,
  now: number,
): number {
  const flood = floodWaitMs(data, now);

  if (data.dmPartners.includes(toGuestId)) return flood;

  data.dmStartTimes = data.dmStartTimes.filter(
    (time) => now - time < NEW_CONVERSATION_WINDOW_MS,
  );
  const newConversation =
    data.dmStartTimes.length >= NEW_CONVERSATIONS_PER_WINDOW
      ? (data.dmStartTimes[0] ?? now) + NEW_CONVERSATION_WINDOW_MS - now
      : 0;

  return Math.max(flood, newConversation);
}

export function createSocketServer(
  httpServer: HttpServer,
  options: {
    inactivityTimeoutMs?: number;
    maxConnectionsPerIp?: number;
    trustedProxyHops?: number;
    // An empty string means no moderator can sign in, like leaving AUTH_TOKEN_SECRET unset.
    authTokenSecret?: string;
  } = {},
): Server {
  const authTokenSecret = options.authTokenSecret ?? env.AUTH_TOKEN_SECRET;
  const inactivityTimeoutMs =
    options.inactivityTimeoutMs ?? env.INACTIVITY_TIMEOUT_MS;
  // Undefined means no cap.
  const maxConnectionsPerIp =
    options.maxConnectionsPerIp ?? env.MAX_CONNECTIONS_PER_IP;
  const trustedProxyHops = options.trustedProxyHops ?? env.TRUST_PROXY_HOPS;
  // Live connections per hashed IP on this process; with several nodes the cap applies to each separately.
  const connectionsPerIp = new Map<string, number>();
  // The secret each connection was given for resuming its identity. Kept out of the socket's data on purpose: that
  // is copied between nodes, and this belongs to the one client it was sent to.
  const resumeSecrets = new WeakMap<object, string>();
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    maxHttpBufferSize: MAX_PACKET_BYTES,
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
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
        role: (member.data as SocketData).role,
        avatar: (member.data as SocketData).avatar,
        ...((member.data as SocketData).age === undefined
          ? {}
          : { age: (member.data as SocketData).age }),
      })),
    });
  }

  // Whether somebody else in the room already has this name, so two people are never mistaken for each other. Case,
  // spaces and punctuation do not make a name different. A moderator signed in on two connections is one person.
  async function nameInUse(
    slug: string,
    data: SocketData,
    nickname: string,
  ): Promise<boolean> {
    const name = normalizeName(nickname);

    return (await io.in(roomKey(slug)).fetchSockets()).some((member) => {
      const other = member.data as SocketData;

      return (
        other.guestId !== data.guestId &&
        normalizeName(other.nickname) === name &&
        !(other.accountId !== undefined && other.accountId === data.accountId)
      );
    });
  }

  // Sign-in, reserved-name and ban checks run before the connection is accepted; they fail closed when a cache is
  // unreachable. A moderator arrives with a signed token and gets the name from their account; a guest picks a
  // nickname, which must not look like a moderator's.
  io.use(async (socket, next) => {
    const auth = socket.handshake.auth ?? {};
    let nickname: string | null;
    let role: ChatRole = "guest";
    let accountId: number | undefined;

    if (auth.token !== undefined) {
      const claims = authTokenSecret
        ? verifyToken(auth.token, { secret: authTokenSecret })
        : undefined;

      if (!claims) return next(new Error("invalid_token"));

      // The token proves who signed in, not that they still may moderate: the account could have been removed since.
      try {
        const moderators = await getModerators();

        if (!moderators) {
          console.error("Moderators have not been read from Payload yet");
          return next(new Error("unavailable"));
        }

        if (!moderators.some((moderator) => moderator.id === claims.sub)) {
          return next(new Error("invalid_token"));
        }
      } catch (error) {
        console.error("Moderator check failed:", error);
        return next(new Error("unavailable"));
      }

      nickname = claims.name;
      role = claims.role;
      accountId = claims.sub;
    } else {
      nickname = validateNickname(auth.nickname);

      if (!nickname) {
        return next(new Error("invalid_nickname"));
      }

      try {
        if (isReservedNickname(nickname, await getModeratorNames())) {
          return next(new Error("reserved_nickname"));
        }
      } catch (error) {
        console.error("Moderator names unavailable:", error);
        return next(new Error("unavailable"));
      }
    }

    const ipHash = hashIdentifier(
      getClientIp(socket.handshake, trustedProxyHops),
    );

    try {
      if (!ROLE_RULES[role].ignoresIpBans && (await isBanned(ipHash))) {
        return next(new Error("banned"));
      }
    } catch (error) {
      console.error("Ban check failed:", error);
      return next(new Error("unavailable"));
    }

    // A reload is a new connection. With the secret the old one was given, the new one is the same guest: it takes
    // the old guest id, so what is addressed to that id (private conversations) carries on. Without it, or when it is
    // not right, the connection simply gets an identity of its own.
    let guestId: string = crypto.randomUUID();
    const claimedId = typeof auth.guestId === "string" ? auth.guestId : "";
    const claimedSecret =
      typeof auth.resumeSecret === "string" ? auth.resumeSecret : "";

    try {
      if (
        claimedId &&
        claimedSecret &&
        (await verifyResume(claimedId, claimedSecret))
      ) {
        // The old connection may not have been noticed gone yet; the guest is only in the room once.
        for (const old of await io.fetchSockets()) {
          if ((old.data as SocketData).guestId === claimedId) {
            old.emit("kicked", { reason: "replaced" });
            old.disconnect(true);
          }
        }

        guestId = claimedId;
      }

      // A new secret every time: one that was used is no use to anybody who saw it.
      const secret = newResumeSecret();
      await rememberResume(guestId, secret);
      resumeSecrets.set(socket, secret);
    } catch (error) {
      console.error("Resuming an identity failed:", error);
      return next(new Error("unavailable"));
    }

    // Everything from here to next() is synchronous. The guest may have left during the checks above; if so
    // Socket.IO never emits "connection", so a slot reserved now would never be released.
    if (socket.client.conn.readyState !== "open") {
      return next(new Error("closed"));
    }

    if (
      maxConnectionsPerIp !== undefined &&
      !ROLE_RULES[role].ignoresConnectionCap
    ) {
      const current = connectionsPerIp.get(ipHash) ?? 0;

      if (current >= maxConnectionsPerIp) {
        return next(new Error("too_many_connections"));
      }

      connectionsPerIp.set(ipHash, current + 1);
    }

    socket.data = {
      guestId,
      nickname,
      role,
      avatar: role === "guest" ? parseAvatar(auth.avatar) : "other",
      age: role === "guest" ? parseAge(auth.age) : undefined,
      accountId,
      ipHash,
      recentMessageTimes: [],
      profileChangeTimes: [],
      reactionTimes: [],
      blockedGuestIds: [],
      dmPartners: [],
      dmStartTimes: [],
    } satisfies SocketData;
    next();
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;

    // First, so the slot reserved in the middleware is always given back.
    socket.on("disconnect", () => {
      if (
        maxConnectionsPerIp === undefined ||
        ROLE_RULES[data.role].ignoresConnectionCap
      ) {
        return;
      }

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

    socket.emit("session", {
      guestId: data.guestId,
      nickname: data.nickname,
      role: data.role,
      avatar: data.avatar,
      ...(data.age === undefined ? {} : { age: data.age }),
      resumeSecret: resumeSecrets.get(socket),
    });

    // Whoever connects sees the latest announcement, even one made before they arrived. Failing to read it must
    // not stop anyone from chatting.
    getLatestAnnouncement()
      .then((latest) => {
        if (latest) socket.emit("announcement:new", latest);
      })
      .catch((error) =>
        console.error("Failed to read the announcement:", error),
      );

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

    socket.on("announce:send", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};

      if (!ROLE_RULES[data.role].canAnnounce || data.accountId === undefined) {
        return reply({ ok: false, error: "forbidden" });
      }

      const text = stringField(payload, "text").trim();

      // Checked before the wait is taken, so a refused attempt does not use up the moderator's turn.
      if (!text || text.length > MAX_ANNOUNCEMENT_LENGTH) {
        return reply({ ok: false, error: "invalid_message" });
      }

      const announcement: Announcement = {
        id: crypto.randomUUID(),
        text,
        sentAt: new Date().toISOString(),
        name: data.nickname,
      };

      try {
        const waitMs = await claimAnnouncementSlot(data.accountId);

        if (waitMs > 0) {
          return reply({
            ok: false,
            error: "rate_limited",
            retryAfterMs: waitMs,
          });
        }
      } catch (error) {
        console.error("Failed to check the announcement wait:", error);
        return reply({ ok: false, error: "unavailable" });
      }

      // Delivered live even if it cannot be kept; only people who connect later would miss it.
      await saveAnnouncement(announcement).catch((error) =>
        console.error("Failed to keep the announcement:", error),
      );

      io.emit("announcement:new", announcement);
      reply({ ok: true });
    });

    // Direct messages go to one guest in the same room and are never stored. Whoever sent one is shown it too, so
    // a client has one place to read them from.
    socket.on("dm:send", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const slug = data.roomSlug;

      if (!slug) return reply({ ok: false, error: "not_in_room" });

      const toGuestId = stringField(payload, "toGuestId");

      if (!toGuestId || toGuestId === data.guestId) {
        return reply({ ok: false, error: "invalid_recipient" });
      }

      const text = messageText(payload);

      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        return reply({ ok: false, error: "invalid_message" });
      }

      // Somebody the guest has blocked is not written to until they are unblocked.
      if (data.blockedGuestIds.includes(toGuestId)) {
        return reply({ ok: false, error: "recipient_blocked" });
      }

      const refuse = (waitMs: number) =>
        reply({ ok: false, error: "rate_limited", retryAfterMs: waitMs });
      const firstWait = directMessageWaitMs(data, toGuestId, Date.now());

      if (firstWait > 0) return refuse(firstWait);

      let recipient;

      try {
        recipient = (await io.in(roomKey(slug)).fetchSockets()).find(
          (member) => (member.data as SocketData).guestId === toGuestId,
        );
      } catch (error) {
        console.error("Failed to look up the recipient:", error);
        return reply({ ok: false, error: "unavailable" });
      }

      if (!recipient) return reply({ ok: false, error: "user_not_found" });
      if (data.roomSlug !== slug)
        return reply({ ok: false, error: "not_in_room" });

      const recipientData = recipient.data as SocketData;

      // Somebody who has been blocked is told so, and nothing is sent or counted.
      if (
        ROLE_RULES[data.role].blockable &&
        recipientData.blockedGuestIds.includes(data.guestId)
      ) {
        return reply({ ok: false, error: "blocked_by_recipient" });
      }

      // The lookup took time, so the limits are checked again; everything after this is synchronous, so two messages
      // sent back to back cannot both pass.
      const now = Date.now();
      const wait = directMessageWaitMs(data, toGuestId, now);

      if (wait > 0) return refuse(wait);

      data.recentMessageTimes.push(now);

      if (!data.dmPartners.includes(toGuestId)) {
        data.dmStartTimes.push(now);
        data.dmPartners = [...data.dmPartners, toGuestId].slice(
          -MAX_REMEMBERED_PARTNERS,
        );
      }

      const message = {
        id: crypto.randomUUID(),
        fromGuestId: data.guestId,
        fromNickname: data.nickname,
        fromRole: data.role,
        fromAvatar: data.avatar,
        toGuestId,
        toNickname: recipientData.nickname,
        toAvatar: recipientData.avatar,
        text,
        sentAt: new Date(now).toISOString(),
      };

      recipient.emit("dm:new", message);
      socket.emit("dm:new", message);
      reply({ ok: true });
    });

    // Tells the guest who was blocked or unblocked, if they are here and could be blocked at all.
    async function tellBlocked(
      guestId: string,
      event: "dm:blocked" | "dm:unblocked",
    ) {
      const slug = data.roomSlug;

      if (!slug) return;

      try {
        const target = (await io.in(roomKey(slug)).fetchSockets()).find(
          (member) => (member.data as SocketData).guestId === guestId,
        );

        if (target && ROLE_RULES[(target.data as SocketData).role].blockable) {
          target.emit(event, {
            guestId: data.guestId,
            nickname: data.nickname,
            role: data.role,
            avatar: data.avatar,
          });
        }
      } catch (error) {
        console.error("Failed to tell a guest about a block:", error);
      }
    }

    socket.on("dm:block", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const guestId = stringField(payload, "guestId");

      if (!guestId || guestId.length > MAX_GUEST_ID_LENGTH) {
        return reply({ ok: false, error: "invalid_request" });
      }

      const added = !data.blockedGuestIds.includes(guestId);

      if (added) {
        if (data.blockedGuestIds.length >= MAX_BLOCKED) {
          return reply({ ok: false, error: "too_many_blocked" });
        }

        data.blockedGuestIds.push(guestId);
      }

      reply({ ok: true });

      if (added) await tellBlocked(guestId, "dm:blocked");
    });

    socket.on("dm:unblock", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const guestId = stringField(payload, "guestId");
      const was = data.blockedGuestIds.includes(guestId);

      data.blockedGuestIds = data.blockedGuestIds.filter(
        (id) => id !== guestId,
      );
      reply({ ok: true });

      if (was) await tellBlocked(guestId, "dm:unblocked");
    });

    // A guest changes who they are shown as: the name, the avatar and the age, each only when it is in the payload (an
    // age of null takes it back). Everything is checked before anything changes. A moderator's name belongs to their
    // account, so they cannot.
    socket.on("profile:update", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};

      if (data.role !== "guest") {
        return reply({ ok: false, error: "forbidden" });
      }

      const fields: Record<string, unknown> =
        typeof payload === "object" && payload !== null
          ? (payload as Record<string, unknown>)
          : {};
      const now = Date.now();

      data.profileChangeTimes = data.profileChangeTimes.filter(
        (time) => now - time < PROFILE_CHANGE_WINDOW_MS,
      );

      if (data.profileChangeTimes.length >= PROFILE_CHANGES_PER_WINDOW) {
        return reply({
          ok: false,
          error: "rate_limited",
          retryAfterMs:
            (data.profileChangeTimes[0] ?? now) +
            PROFILE_CHANGE_WINDOW_MS -
            now,
        });
      }

      let nickname = data.nickname;
      let avatar = data.avatar;
      let age = data.age;

      if ("nickname" in fields) {
        const valid = validateNickname(fields.nickname);

        if (!valid) return reply({ ok: false, error: "invalid_nickname" });

        if (valid !== data.nickname) {
          try {
            if (isReservedNickname(valid, await getModeratorNames())) {
              return reply({ ok: false, error: "reserved_nickname" });
            }
          } catch (error) {
            console.error("Moderator names unavailable:", error);
            return reply({ ok: false, error: "unavailable" });
          }
        }

        nickname = valid;
      }

      if ("avatar" in fields) {
        const parsed = avatarSchema.safeParse(fields.avatar);

        if (!parsed.success) {
          return reply({ ok: false, error: "invalid_profile" });
        }

        avatar = parsed.data;
      }

      if ("age" in fields) {
        age = fields.age === null ? undefined : parseAge(fields.age);

        if (fields.age !== null && age === undefined) {
          return reply({ ok: false, error: "invalid_profile" });
        }
      }

      const slug = data.roomSlug;
      const apply = () => {
        data.nickname = nickname;
        data.avatar = avatar;
        data.age = age;
        data.profileChangeTimes.push(now);
      };

      // A new name must not be one somebody else in the room has; checked and taken under the room's lock, so two
      // people choosing the same name at once cannot both get it.
      if (slug && normalizeName(nickname) !== normalizeName(data.nickname)) {
        const taken = await withRoomLock(slug, async () => {
          if (await nameInUse(slug, data, nickname)) return true;

          apply();
          return false;
        });

        if (taken) return reply({ ok: false, error: "nickname_taken" });
      } else {
        apply();
      }

      reply({
        ok: true,
        profile: { nickname, avatar, ...(age === undefined ? {} : { age }) },
      });

      if (data.roomSlug) await emitPresence(data.roomSlug);
    });

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

        if (await nameInUse(slug, data, data.nickname)) {
          return "nickname_taken" as const;
        }

        await leaveRoom();
        data.roomSlug = slug;
        await socket.join(roomKey(slug));
        return "joined" as const;
      });

      if (outcome === "room_full") {
        return reply({ ok: false, error: "room_full" });
      }

      if (outcome === "nickname_taken") {
        return reply({ ok: false, error: "nickname_taken" });
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
      const text = messageText(payload);

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

      // The general flood limit always applies; slow mode adds a longer wait that follows the guest between rooms,
      // so hopping from room to room is no way round it.
      const waitMs = Math.max(
        floodWaitMs(data, now),
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
        role: data.role,
        avatar: data.avatar,
        text,
        sentAt: new Date(now).toISOString(),
      };

      // Recorded before it is delivered, so whatever a guest has seen live is also in the history a later joiner
      // reads. The stored copy also names the sender's IP hash so a later ban can reach it; that never leaves the
      // server. Roles that ignore IP bans store none, so a ban on a shared address cannot touch their messages. A
      // Redis failure costs the history entry, not the message.
      const storedIpHash = ROLE_RULES[data.role].ignoresIpBans
        ? ""
        : data.ipHash;

      try {
        await recordMessage({ ...message, ipHash: storedIpHash });
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

    // Adds the guest's reaction to a message in their room, or removes it if they had already made it.
    socket.on("reaction:toggle", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const slug = data.roomSlug;

      if (!slug) {
        return reply({ ok: false, error: "not_in_room" });
      }

      const messageId = stringField(payload, "messageId");
      const emoji = stringField(payload, "emoji");

      if (!isReactionEmoji(emoji) || !messageId || messageId.length > 64) {
        return reply({ ok: false, error: "invalid_reaction" });
      }

      const now = Date.now();
      data.reactionTimes = data.reactionTimes.filter(
        (time) => now - time < REACTION_WINDOW_MS,
      );

      if (data.reactionTimes.length >= REACTIONS_PER_WINDOW) {
        return reply({
          ok: false,
          error: "rate_limited",
          retryAfterMs:
            (data.reactionTimes[0] ?? now) + REACTION_WINDOW_MS - now,
        });
      }

      data.reactionTimes.push(now);

      let result;

      try {
        result = await toggleReaction(slug, messageId, emoji, {
          guestId: data.guestId,
          nickname: data.nickname,
        });
      } catch (error) {
        console.error("Failed to record a reaction:", error);
        return reply({ ok: false, error: "unavailable" });
      }

      if (!result.ok) {
        return reply({
          ok: false,
          error:
            result.reason === "not_found"
              ? "message_not_found"
              : "invalid_reaction",
        });
      }

      io.to(roomKey(slug)).emit("reaction:update", {
        roomSlug: slug,
        messageId,
        reactions: result.reactions,
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

// Cuts off signed-in accounts that may no longer moderate, even though their token has not expired. Like bans, every
// node does this for its own connections.
export async function enforceModerators(
  io: Server,
  moderatorIds: number[],
): Promise<void> {
  const allowed = new Set(moderatorIds);

  for (const socket of io.sockets.sockets.values()) {
    const { accountId } = socket.data as SocketData;

    if (accountId === undefined || allowed.has(accountId)) continue;

    socket.emit("kicked", { reason: "invalid_token" });
    socket.disconnect(true);
  }
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
    if (!banned.has(data.ipHash) || ROLE_RULES[data.role].ignoresIpBans) {
      continue;
    }

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
