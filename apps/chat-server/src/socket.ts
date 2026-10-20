import crypto from "crypto";
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { PROFILE_UPDATE_EVENT } from "../../../shared/chatProtocol.mjs";

import { parseAge } from "./age.js";
import {
  ADMIN_ROOMS,
  fakeMember,
  isAdminRoom,
  type FakeMember,
} from "./adminRooms.js";
import { createCrowd, crowdReply, MAX_CROWD, type Crowd } from "./crowd.js";
import { parseAvatar, parsePicture, type Avatar } from "./avatars.js";
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
  markAway,
  recordMessage,
  recordMovement,
  redactMessagesFrom,
  reportMessage,
  takeAway,
  toggleReaction,
} from "./history.js";
import {
  hashIdentifier,
  getClientIp,
  hashMember,
  memberGuestId,
  moderatorGuestId,
  validateNickname,
} from "./identity.js";
import { MAX_MESSAGE_LENGTH, slidingWindow } from "./limits.js";
import { isMemberName } from "./members.js";
import { handleProfileUpdate } from "./socketProfile.js";
import { claimGuestAccount, PasswordAccountError } from "./passwordAccounts.js";
import { withProfileLock } from "./profileLock.js";
import {
  getModerators,
  getModeratorNames,
  isReservedNickname,
  normalizeName,
} from "./names.js";
import { isReactionEmoji } from "./reactions.js";
import {
  fetchUser,
  REPORT_REASONS,
  type ReportReason,
} from "./payloadClient.js";
import { recordReport } from "./reports.js";
import { pubClient, subClient } from "./redis.js";
import { ROLE_RULES, type ChatRole } from "./roles.js";
import { getCachedPublicRooms } from "./rooms.js";
import { newResumeSecret, rememberResume, verifyResume } from "./resume.js";
import { verifyToken } from "./tokens.js";
import { log } from "./log.js";

// The largest packet a client may send; a longer one closes its connection. The default is 1 MB, while the biggest
// thing a client sends is a 500-character message (3 KB even if every character had to be escaped in JSON).
const MAX_PACKET_BYTES = 8 * 1024;
// How often the server pings a client, and how long it waits for the answer before dropping the connection (these
// are Socket.IO's defaults, set here so that a change of library version cannot change them unnoticed).
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 20_000;
const MAX_ANNOUNCEMENT_LENGTH = 500;
// Why the server removes somebody, which an admin can have shown to themselves to see what it looks like.
const KICK_REASONS = ["inactivity", "banned", "replaced", "invalid_token"];
// A guest who has done nothing is warned this long before they are disconnected for it (when the timeout is longer).
const IDLE_WARNING_BEFORE_MS = 2 * 60_000;
// Somebody who goes out of a room and is back within this long (a reload, a dropped connection) is not announced as
// having gone.
const LEAVE_GRACE_MS = 15_000;
const RATE_LIMIT_MAX_MESSAGES = 5;
const RATE_LIMIT_WINDOW_MS = 5_000;
// Starting a conversation reaches somebody new, so it is limited more tightly than messages in one already going.
const NEW_CONVERSATIONS_PER_WINDOW = 5;
const NEW_CONVERSATION_WINDOW_MS = 60_000;
// Bounds what one connection can make the server remember.
const MAX_BLOCKED = 100;
const MAX_REMEMBERED_PARTNERS = 200;
const MAX_GUEST_ID_LENGTH = 64;
// Reactions are cheap, but each one is rewritten into Redis and shown to the whole room.
const REACTIONS_PER_WINDOW = 10;
const REACTION_WINDOW_MS = 5_000;
// A report can hide somebody's message, so one connection cannot file many of them.
const REPORTS_PER_WINDOW = 5;
const REPORT_WINDOW_MS = 60_000;

interface SocketData {
  guestId: string;
  nickname: string;
  role: ChatRole;
  avatar: Avatar;
  // The picture somebody chose ("lorelei:k3j9x2ab"), which the client draws. A moderator has none.
  picture?: string;
  // Only when the guest said how old they are.
  age?: number;
  // The Payload account behind a signed-in moderator; others have none.
  accountId?: number;
  // A super-admin, who may use the testing tools (see adminRooms.ts).
  admin?: boolean;
  // The account of a member (the `users` collection), whose profile is kept there.
  memberId?: number;
  // A member's username, which their display name must not be taken for.
  username?: string;
  ipHash: string;
  // What a ban names to reach this connection's messages and reports: the address hash of a guest, the account's hash
  // for a member (so the ban follows the account to any address).
  identityHash: string;
  // Set when a ban removes the guest, so a message still being recorded at that moment is dropped.
  banned?: boolean;
  roomSlug?: string;
  recentMessageTimes: number[];
  // When the guest last changed their profile, for the limit on that.
  profileChangeTimes: number[];
  // When the guest last reacted to a message, for the limit on that.
  reactionTimes: number[];
  // When the guest last reported a message, for the limit on that.
  reportTimes: number[];
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

// Every connected admin: the test rooms' people and crowd stay while one is, wherever they are, and each is told how the
// crowd stands and how many are in the rooms.
const ADMIN_KEY = "admins";

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

// The ack a client gave, or one that does nothing: a client may emit without waiting for an answer.
function ackOf(ack: unknown): Ack {
  return typeof ack === "function" ? (ack as Ack) : () => {};
}

// Milliseconds until this connection may send another message of any kind; 0 when it may now. Messages in rooms and
// direct messages count together.
function floodWaitMs(data: SocketData, now: number): number {
  const { recent, waitMs } = slidingWindow(
    data.recentMessageTimes,
    now,
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_MESSAGES,
  );
  data.recentMessageTimes = recent;

  return waitMs;
}

// Milliseconds until this connection may react to another message; 0 when it may now.
function reactionWaitMs(data: SocketData, now: number): number {
  const { recent, waitMs } = slidingWindow(
    data.reactionTimes,
    now,
    REACTION_WINDOW_MS,
    REACTIONS_PER_WINDOW,
  );
  data.reactionTimes = recent;

  return waitMs;
}

// The flood limit, plus the limit on starting conversations when this one is new to the sender.
export function directMessageWaitMs(
  data: SocketData,
  toGuestId: string,
  now: number,
): number {
  const flood = floodWaitMs(data, now);

  if (data.dmPartners.includes(toGuestId)) return flood;

  const { recent, waitMs } = slidingWindow(
    data.dmStartTimes,
    now,
    NEW_CONVERSATION_WINDOW_MS,
    NEW_CONVERSATIONS_PER_WINDOW,
  );
  data.dmStartTimes = recent;

  return Math.max(flood, waitMs);
}

// The picture, for putting beside the avatar wherever one is sent: nothing when there is none.
const pictureOf = (data: { picture?: string }) =>
  data.picture === undefined ? {} : { picture: data.picture };

export function createSocketServer(
  httpServer: HttpServer,
  options: {
    inactivityTimeoutMs?: number;
    // How long before an inactivity disconnect the guest is warned, once for each.
    idleWarningBeforeMs?: number;
    // How long somebody can be out of a room before the room is told they went.
    leaveGraceMs?: number;
    maxConnectionsPerIp?: number;
    trustedProxyHops?: number;
    // An empty string means no moderator can sign in, like leaving AUTH_TOKEN_SECRET unset.
    authTokenSecret?: string;
    // How long the crowd of a test room takes to come in.
    crowdRampMs?: number;
  } = {},
): Server {
  const authTokenSecret = options.authTokenSecret ?? env.AUTH_TOKEN_SECRET;
  const inactivityTimeoutMs =
    options.inactivityTimeoutMs ?? env.INACTIVITY_TIMEOUT_MS;
  const idleWarningBeforeMs =
    options.idleWarningBeforeMs ?? IDLE_WARNING_BEFORE_MS;
  const leaveGraceMs = options.leaveGraceMs ?? LEAVE_GRACE_MS;
  // Undefined means no cap.
  const maxConnectionsPerIp =
    options.maxConnectionsPerIp ?? env.MAX_CONNECTIONS_PER_IP;
  const trustedProxyHops = options.trustedProxyHops ?? env.TRUST_PROXY_HOPS;
  // Live connections per hashed IP on this process; with several nodes the cap applies to each separately.
  const connectionsPerIp = new Map<string, number>();
  const claimAttempts = new Map<string, number[]>();
  // The secret each connection was given for resuming its identity. Kept out of the socket's data on purpose: that
  // is copied between nodes, and this belongs to the one client it was sent to.
  const resumeSecrets = new WeakMap<object, string>();
  // The people made up in the test rooms, by room. Only on this node: the test rooms are for one admin at a time.
  const fakeMembers = new Map<string, FakeMember[]>();
  const adminRooms = ADMIN_ROOMS.map((room) => ({
    ...room,
    maxMembers: Number(room.maxMembers),
  }));
  const adminRoomOf = (slug: string) =>
    adminRooms.find((room) => room.slug === slug);
  type QueueEntry = { ahead: number; admit: () => Promise<boolean> };
  const roomQueues = new Map<string, Map<string, QueueEntry>>();

  function notifyQueue(slug: string): void {
    let position = 0;
    for (const [socketId, entry] of roomQueues.get(slug) ?? []) {
      io.to(socketId).emit("room:queue", {
        roomSlug: slug,
        position: ++position + entry.ahead,
      });
    }
  }

  function removeFromQueue(socketId: string): void {
    for (const [slug, queue] of roomQueues) {
      if (!queue.delete(socketId)) continue;
      if (queue.size === 0) roomQueues.delete(slug);
      notifyQueue(slug);
      drainQueue(slug);
    }
  }

  function drainQueue(slug: string): void {
    if (!roomQueues.has(slug)) return;
    void withRoomLock(slug, async () => {
      const queue = roomQueues.get(slug);
      while (queue?.size) {
        const entry = queue.values().next().value;
        if (!entry || !(await entry.admit())) break;
      }
    }).catch((error) => log.error("Failed to admit a queued guest", error));
  }

  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    maxHttpBufferSize: MAX_PACKET_BYTES,
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
  });

  io.adapter(
    createAdapter(pubClient, subClient, { key: env.SOCKET_ADAPTER_KEY }),
  );

  // People who were only for show go when the last real one does; in a test room, when the last admin does.
  async function dropShow(slug: string): Promise<void> {
    if (
      isAdminRoom(slug) &&
      (await io.in(ADMIN_KEY).fetchSockets()).length > 0
    ) {
      return;
    }

    fakeMembers.delete(slug);
    crowd.discard(slug);
  }

  // Who is in a test room, the people who are not there too: what its card in the list says.
  async function peopleIn(slug: string): Promise<number> {
    const here = (await io.in(roomKey(slug)).fetchSockets()).filter(
      (member) => (member.data as SocketData).role !== "moderator",
    ).length;

    return here + (fakeMembers.get(slug)?.length ?? 0);
  }

  async function emitPresence(slug: string): Promise<void> {
    const members = await io.in(roomKey(slug)).fetchSockets();

    if (members.length === 0) await dropShow(slug);

    io.to(roomKey(slug)).emit("room:presence", {
      roomSlug: slug,
      members: [
        ...members.map((member) => ({
          guestId: (member.data as SocketData).guestId,
          nickname: (member.data as SocketData).nickname,
          role: (member.data as SocketData).role,
          avatar: (member.data as SocketData).avatar,
          ...pictureOf(member.data as SocketData),
          ...((member.data as SocketData).age === undefined
            ? {}
            : { age: (member.data as SocketData).age }),
        })),
        ...(fakeMembers.get(slug) ?? []),
      ],
    });

    if (isAdminRoom(slug)) {
      io.to(ADMIN_KEY).emit("admin:count", {
        roomSlug: slug,
        count: await peopleIn(slug),
      });
    }
    drainQueue(slug);
  }

  const announceFake = (
    slug: string,
    event: "joined" | "left",
    who: FakeMember,
  ) =>
    io.to(roomKey(slug)).emit("room:event", {
      id: crypto.randomUUID(),
      roomSlug: slug,
      sentAt: new Date().toISOString(),
      event,
      guestId: who.guestId,
      nickname: who.nickname,
    });

  // How many more people a test room has room for; unlimited when it has no limit.
  async function seatsLeft(slug: string): Promise<number> {
    const limit = adminRoomOf(slug)?.maxMembers;

    if (typeof limit !== "number") return Infinity;

    return Math.max(0, limit - (await peopleIn(slug)));
  }

  // The crowd of a test room: made-up people who write and react as real ones would, through the same paths.
  const crowd: Crowd = createCrowd(
    {
      fakes: fakeMembers,
      seatsLeft,
      say: async (slug, who, text) => {
        const message = {
          id: crypto.randomUUID(),
          roomSlug: slug,
          guestId: who.guestId,
          nickname: who.nickname,
          role: who.role,
          avatar: who.avatar,
          picture: who.picture,
          text,
          sentAt: new Date().toISOString(),
        };

        await recordMessage({ ...message, ipHash: "" }).catch((error) =>
          log.error("Failed to record a message of the crowd", error),
        );
        io.to(roomKey(slug)).emit("message:new", message);
        crowd.heard(slug, message);
      },
      react: async (slug, who, messageId, emoji) => {
        try {
          const result = await toggleReaction(slug, messageId, emoji, {
            guestId: who.guestId,
            nickname: who.nickname,
          });

          if (result.ok) {
            io.to(roomKey(slug)).emit("reaction:update", {
              roomSlug: slug,
              messageId,
              reactions: result.reactions,
            });
          }
        } catch (error) {
          log.error("Failed to record a reaction of the crowd", error);
        }
      },
      joined: async (slug, who) => {
        announceFake(slug, "joined", who);
        await emitPresence(slug);
      },
      left: async (slug, who) => {
        announceFake(slug, "left", who);
        await emitPresence(slug);
      },
      changed: (slug, state) =>
        io
          .to(roomKey(slug))
          .to(ADMIN_KEY)
          .emit("crowd:state", { roomSlug: slug, ...state }),
    },
    { rampMs: options.crowdRampMs },
  );

  // Tells the room that somebody came or went, after it is remembered, so whatever a guest has seen live is also in the
  // history a later joiner reads. Failing to remember it costs the history entry, not the announcement.
  async function announce(
    slug: string,
    event: "joined" | "left",
    data: SocketData,
  ): Promise<void> {
    const movement = {
      id: crypto.randomUUID(),
      roomSlug: slug,
      sentAt: new Date().toISOString(),
      event,
      guestId: data.guestId,
      nickname: data.nickname,
    };

    await recordMovement({ ...movement, ipHash: data.identityHash }).catch(
      (error) => log.error("Failed to remember who came or went", error),
    );
    io.to(roomKey(slug)).emit("room:event", movement);
  }

  // Not announced when the guest is back from a moment ago: whoever left is still in the room as far as anybody knows.
  async function announceJoin(slug: string, data: SocketData): Promise<void> {
    if (data.banned) return;

    const returned = await takeAway(slug, data.guestId).catch((error) => {
      log.error("Failed to read who was away", error);
      return false;
    });

    if (!returned) await announce(slug, "joined", data);
  }

  // Announced once the guest has stayed away for the grace period; whichever of that and their return comes first
  // takes the mark, so only one of them says anything.
  function announceLeave(slug: string, data: SocketData): void {
    if (data.banned) return;
    const who = { ...data };

    const settle = async () => {
      if (leaveGraceMs > 0 && !(await takeAway(slug, who.guestId))) return;
      await announce(slug, "left", who);
    };
    const failed = (error: unknown) =>
      log.error("Failed to announce that somebody left", error);

    if (leaveGraceMs <= 0) {
      settle().catch(failed);
      return;
    }

    markAway(slug, who.guestId, leaveGraceMs * 2)
      .then(() => {
        setTimeout(() => settle().catch(failed), leaveGraceMs).unref();
      })
      .catch(failed);
  }

  // The connection of this guest, if they are in the room. Looking the room up can fail (Redis is down); that is left
  // to the caller.
  async function findInRoom(slug: string, guestId: string) {
    return (await io.in(roomKey(slug)).fetchSockets()).find(
      (member) => (member.data as SocketData).guestId === guestId,
    );
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
        !(
          other.accountId !== undefined && other.accountId === data.accountId
        ) &&
        !(other.memberId !== undefined && other.memberId === data.memberId)
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
    let admin = false;
    let memberId: number | undefined;
    let username: string | undefined;
    let avatar: Avatar = "other";
    let picture: string | undefined;
    let age: number | undefined;

    if (auth.token !== undefined) {
      const claims = authTokenSecret
        ? verifyToken(auth.token, { secret: authTokenSecret })
        : undefined;

      if (!claims) return next(new Error("invalid_token"));

      if (claims.role === "member") {
        // The token proves whose account it is; who they are shown as is what the account says now.
        try {
          const user = await fetchUser(claims.sub);

          if (!user) return next(new Error("invalid_token"));

          nickname = user.displayName;
          username = user.nickname;
          avatar = user.avatar;
          picture = user.picture;
          age = user.age;
          memberId = user.id;
          role = "member";
        } catch (error) {
          log.error("Account check failed", error);
          return next(new Error("unavailable"));
        }
      } else {
        // The token proves who signed in, not that they still may moderate: the account could have been removed since.
        try {
          const moderators = await getModerators();

          if (!moderators) {
            log.error("Moderators have not been read from Payload yet");
            return next(new Error("unavailable"));
          }

          if (!moderators.some((moderator) => moderator.id === claims.sub)) {
            return next(new Error("invalid_token"));
          }

          admin =
            moderators.find((moderator) => moderator.id === claims.sub)
              ?.admin === true;
        } catch (error) {
          log.error("Moderator check failed", error);
          return next(new Error("unavailable"));
        }

        nickname = claims.name;
        role = claims.role;
        accountId = claims.sub;
      }
    } else {
      nickname = validateNickname(auth.nickname);

      if (!nickname) {
        return next(new Error("invalid_nickname"));
      }

      try {
        if (
          isReservedNickname(nickname, await getModeratorNames()) ||
          (await isMemberName(nickname))
        ) {
          return next(new Error("reserved_nickname"));
        }
      } catch (error) {
        log.error("Reserved names unavailable", error);
        return next(new Error("unavailable"));
      }

      avatar = parseAvatar(auth.avatar);
      picture = parsePicture(auth.picture);
      age = parseAge(auth.age);
    }

    const ipHash = hashIdentifier(
      getClientIp(socket.handshake, trustedProxyHops),
    );
    const identityHash = memberId === undefined ? ipHash : hashMember(memberId);

    try {
      if (
        !ROLE_RULES[role].ignoresIpBans &&
        ((await isBanned(ipHash)) ||
          (memberId !== undefined && (await isBanned(identityHash))))
      ) {
        return next(new Error("banned"));
      }
    } catch (error) {
      log.error("Ban check failed", error);
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
      // An account always has the same guest id and its token proves it, so no secret is needed to take over; a guest
      // needs the one the old connection was given.
      const takenOver =
        accountId !== undefined
          ? moderatorGuestId(accountId)
          : memberId !== undefined
            ? memberGuestId(memberId)
            : claimedId &&
                claimedSecret &&
                (await verifyResume(claimedId, claimedSecret))
              ? claimedId
              : undefined;

      if (takenOver) {
        // The old connection may not have been noticed gone yet; the guest is only in the room once.
        for (const old of await io.fetchSockets()) {
          if ((old.data as SocketData).guestId === takenOver) {
            old.emit("kicked", { reason: "replaced" });
            old.disconnect(true);
          }
        }

        guestId = takenOver;
      }

      // A new secret every time: one that was used is no use to anybody who saw it.
      const secret = newResumeSecret();
      await rememberResume(guestId, secret);
      resumeSecrets.set(socket, secret);
    } catch (error) {
      log.error("Resuming an identity failed", error);
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
      avatar,
      picture,
      age,
      accountId,
      ...(admin ? { admin } : {}),
      memberId,
      username,
      ipHash,
      identityHash,
      recentMessageTimes: [],
      profileChangeTimes: [],
      reactionTimes: [],
      reportTimes: [],
      blockedGuestIds: [],
      dmPartners: [],
      dmStartTimes: [],
    } satisfies SocketData;
    next();
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    let claiming = false;
    let claimed = false;
    let queueTest = { enabled: false, ahead: 0 };

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

    for (const previous of io.of("/").sockets.values()) {
      if (
        previous.id !== socket.id &&
        (previous.data as SocketData).guestId === data.guestId
      ) {
        previous.emit("kicked", { reason: "replaced" });
        previous.disconnect(true);
      }
    }

    async function leaveRoom(): Promise<void> {
      const slug = data.roomSlug;
      if (!slug) return;

      data.roomSlug = undefined;
      await socket.leave(roomKey(slug));
      announceLeave(slug, data);
      await emitPresence(slug);
    }

    if (data.admin) {
      void Promise.resolve(socket.join(ADMIN_KEY)).then(async () => {
        for (const { slug } of ADMIN_ROOMS) {
          socket.emit("crowd:state", { roomSlug: slug, ...crowd.state(slug) });
          socket.emit("admin:count", {
            roomSlug: slug,
            count: await peopleIn(slug),
          });
        }
      });
    }

    socket.emit("session", {
      guestId: data.guestId,
      nickname: data.nickname,
      role: data.role,
      avatar: data.avatar,
      ...pictureOf(data),
      ...(data.age === undefined ? {} : { age: data.age }),
      ...(data.admin ? { admin: true, adminRooms, queueTest } : {}),
      resumeSecret: resumeSecrets.get(socket),
    });

    // Whoever connects sees the latest announcement, even one made before they arrived. Failing to read it must
    // not stop anyone from chatting.
    getLatestAnnouncement()
      .then((latest) => {
        if (latest) socket.emit("announcement:new", latest);
      })
      .catch((error) => log.error("Failed to read the announcement", error));

    // Any client event counts as activity. A guest who has done nothing for a while is warned once, shortly before they
    // go, and told when the warning no longer holds because they did something. A moderator is never sent away.
    let idleTimers: NodeJS.Timeout[] = [];
    let warned = false;
    const isQueued = () =>
      [...roomQueues.values()].some((queue) => queue.has(socket.id));
    const resetIdleTimer = (): void => {
      if (ROLE_RULES[data.role].ignoresInactivity) return;

      idleTimers.forEach(clearTimeout);

      if (warned) {
        warned = false;
        socket.emit("idle:cleared");
      }

      idleTimers = [
        ...(idleWarningBeforeMs < inactivityTimeoutMs
          ? [
              setTimeout(() => {
                if (isQueued()) return;
                warned = true;
                socket.emit("idle:warning", {
                  remainingMs: idleWarningBeforeMs,
                });
              }, inactivityTimeoutMs - idleWarningBeforeMs),
            ]
          : []),
        setTimeout(() => {
          if (isQueued()) return resetIdleTimer();
          socket.emit("kicked", { reason: "inactivity" });
          socket.disconnect(true);
        }, inactivityTimeoutMs),
      ];
    };

    resetIdleTimer();
    socket.onAny(resetIdleTimer);

    socket.on("announce:send", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);

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
        log.error("Failed to check the announcement wait", error);
        return reply({ ok: false, error: "unavailable" });
      }

      // Delivered live even if it cannot be kept; only people who connect later would miss it.
      await saveAnnouncement(announcement).catch((error) =>
        log.error("Failed to keep the announcement", error),
      );

      io.emit("announcement:new", announcement);
      reply({ ok: true });
    });

    // Direct messages go to one guest in the same room and are never stored. Whoever sent one is shown it too, so
    // a client has one place to read them from.
    socket.on("dm:send", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);
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

      // Somebody who is not there (see adminRooms.ts) has no connection to look up or to send to.
      const fake = (fakeMembers.get(slug) ?? []).find(
        (who) => who.guestId === toGuestId,
      );
      let recipient;

      if (!fake) {
        try {
          recipient = await findInRoom(slug, toGuestId);
        } catch (error) {
          log.error("Failed to look up the recipient", error);
          return reply({ ok: false, error: "unavailable" });
        }

        if (!recipient) return reply({ ok: false, error: "user_not_found" });
      }

      if (data.roomSlug !== slug)
        return reply({ ok: false, error: "not_in_room" });

      const recipientData = fake ?? (recipient?.data as SocketData);

      // Somebody who has been blocked is told so, and nothing is sent or counted.
      if (
        recipient &&
        ROLE_RULES[data.role].blockable &&
        (recipientData as SocketData).blockedGuestIds.includes(data.guestId)
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
        ...(data.picture === undefined ? {} : { fromPicture: data.picture }),
        toGuestId,
        toNickname: recipientData.nickname,
        toAvatar: recipientData.avatar,
        ...(recipientData.picture === undefined
          ? {}
          : { toPicture: recipientData.picture }),
        text,
        sentAt: new Date(now).toISOString(),
      };

      recipient?.emit("dm:new", message);
      socket.emit("dm:new", message);
      reply({ ok: true });

      if (fake) answerAsFake(slug, fake);
    });

    // Somebody who is not there answers a private message after a moment, if they and the guest are still in the room.
    function answerAsFake(slug: string, who: FakeMember) {
      setTimeout(
        () => {
          const here = (fakeMembers.get(slug) ?? []).some(
            (fake) => fake.guestId === who.guestId,
          );

          if (!here || data.roomSlug !== slug || !socket.connected) return;

          socket.emit("dm:new", {
            id: crypto.randomUUID(),
            fromGuestId: who.guestId,
            fromNickname: who.nickname,
            fromRole: who.role,
            fromAvatar: who.avatar,
            fromPicture: who.picture,
            toGuestId: data.guestId,
            toNickname: data.nickname,
            toAvatar: data.avatar,
            ...(data.picture === undefined ? {} : { toPicture: data.picture }),
            text: crowdReply(),
            sentAt: new Date().toISOString(),
          });
        },
        1500 + Math.random() * 3500,
      ).unref();
    }

    // Direct messages are not stored, so there is nothing to keep a reaction in: it is passed on to both people, whose
    // clients each apply it to their own copy of the message.
    socket.on("dm:react", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);
      const slug = data.roomSlug;

      if (!slug) return reply({ ok: false, error: "not_in_room" });

      const toGuestId = stringField(payload, "toGuestId");

      if (
        !toGuestId ||
        toGuestId.length > MAX_GUEST_ID_LENGTH ||
        toGuestId === data.guestId
      ) {
        return reply({ ok: false, error: "invalid_recipient" });
      }

      const messageId = stringField(payload, "messageId");
      const emoji = stringField(payload, "emoji");
      const on = (payload as Record<string, unknown> | null | undefined)?.on;

      if (
        !isReactionEmoji(emoji) ||
        !messageId ||
        messageId.length > 64 ||
        typeof on !== "boolean"
      ) {
        return reply({ ok: false, error: "invalid_reaction" });
      }

      if (data.blockedGuestIds.includes(toGuestId)) {
        return reply({ ok: false, error: "recipient_blocked" });
      }

      const now = Date.now();
      const reactionWait = reactionWaitMs(data, now);

      if (reactionWait > 0) {
        return reply({
          ok: false,
          error: "rate_limited",
          retryAfterMs: reactionWait,
        });
      }

      let recipient;
      const fake = (fakeMembers.get(slug) ?? []).some(
        (who) => who.guestId === toGuestId,
      );

      if (!fake) {
        try {
          recipient = await findInRoom(slug, toGuestId);
        } catch (error) {
          log.error("Failed to look up the recipient", error);
          return reply({ ok: false, error: "unavailable" });
        }

        if (!recipient) return reply({ ok: false, error: "user_not_found" });
      }

      if (data.roomSlug !== slug)
        return reply({ ok: false, error: "not_in_room" });

      if (
        recipient &&
        ROLE_RULES[data.role].blockable &&
        (recipient.data as SocketData).blockedGuestIds.includes(data.guestId)
      ) {
        return reply({ ok: false, error: "blocked_by_recipient" });
      }

      data.reactionTimes.push(now);

      const update = {
        messageId,
        emoji,
        on,
        byGuestId: data.guestId,
        byNickname: data.nickname,
        toGuestId,
      };

      recipient?.emit("dm:reaction", update);
      socket.emit("dm:reaction", update);
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
        const target = await findInRoom(slug, guestId);

        if (target && ROLE_RULES[(target.data as SocketData).role].blockable) {
          target.emit(event, {
            guestId: data.guestId,
            nickname: data.nickname,
            role: data.role,
            avatar: data.avatar,
            ...pictureOf(data),
          });
        }
      } catch (error) {
        log.error("Failed to tell a guest about a block", error);
      }
    }

    socket.on("dm:block", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);
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
      const reply = ackOf(ack);
      const guestId = stringField(payload, "guestId");
      const was = data.blockedGuestIds.includes(guestId);

      data.blockedGuestIds = data.blockedGuestIds.filter(
        (id) => id !== guestId,
      );
      reply({ ok: true });

      if (was) await tellBlocked(guestId, "dm:unblocked");
    });

    // A guest or a member changes who they are shown as: the name, the avatar and the age, each only when it is in the
    // payload (an age of null takes it back). Everything is checked before anything changes, and a member's change is
    // kept in their account. A moderator's name belongs to their account, so they cannot.
    socket.on("account:claim", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);
      if (data.role !== "guest" || !authTokenSecret)
        return reply({ ok: false, error: "forbidden" });
      if (claiming || claimed) return reply({ ok: false, error: "forbidden" });
      const now = Date.now();
      for (const [ip, attempts] of claimAttempts) {
        if ((attempts.at(-1) ?? 0) <= now - 60_000) claimAttempts.delete(ip);
      }
      const limit = slidingWindow(
        claimAttempts.get(data.ipHash) ?? [],
        now,
        60_000,
        5,
      );
      claimAttempts.set(data.ipHash, limit.recent);
      if (limit.waitMs > 0)
        return reply({
          ok: false,
          error: "rate_limited",
          retryAfterMs: limit.waitMs,
        });
      limit.recent.push(now);
      claiming = true;
      try {
        await withProfileLock(`socket:${socket.id}`, async () => {
          if (!socket.connected) return;
          const account = await claimGuestAccount(
            payload,
            data,
            authTokenSecret,
          );
          claimed = true;
          reply({ ok: true, account });
        });
      } catch (error) {
        if (!(error instanceof PasswordAccountError))
          log.error("Failed to claim guest account");
        reply({
          ok: false,
          error:
            error instanceof PasswordAccountError
              ? error.message
              : "unavailable",
        });
      } finally {
        claiming = false;
      }
    });

    socket.on(PROFILE_UPDATE_EVENT, (payload: unknown, ack?: Ack) =>
      handleProfileUpdate(payload, ackOf(ack), {
        socket,
        data,
        withRoomLock,
        nameInUse: (slug, nickname) => nameInUse(slug, data, nickname),
        emitPresence,
      }),
    );

    async function tryJoinRoom(
      room: { slug: string; maxMembers?: number | null },
      waiting?: QueueEntry,
    ) {
      const { slug } = room;
      if (socket.disconnected) return "disconnected" as const;
      if (data.roomSlug === slug) return "already_joined" as const;

      const limit = room.maxMembers;
      const respectsCapacity =
        data.role !== "moderator" || (data.admin && queueTest.enabled);

      const first = roomQueues.get(slug)?.keys().next().value;
      if (respectsCapacity && first && first !== socket.id)
        return "room_full" as const;

      if (waiting && waiting.ahead > 0) return "room_full" as const;

      if (typeof limit === "number" && respectsCapacity) {
        const members = await io.in(roomKey(slug)).fetchSockets();
        const made = fakeMembers.get(slug)?.length ?? 0;
        const participants = members.filter(
          (member) => (member.data as SocketData).role !== "moderator",
        ).length;
        if (participants + made >= limit) return "room_full" as const;
      }

      if (await nameInUse(slug, data, data.nickname)) {
        return "nickname_taken" as const;
      }

      if (socket.disconnected) return "disconnected" as const;
      if (waiting && roomQueues.get(slug)?.get(socket.id) !== waiting)
        return "cancelled" as const;

      removeFromQueue(socket.id);
      if (waiting) resetIdleTimer();
      socket.emit("room:joining", { roomSlug: slug });
      await leaveRoom();
      data.roomSlug = slug;
      await socket.join(roomKey(slug));
      return "joined" as const;
    }

    async function joinedRoom(slug: string, announce: boolean) {
      if (announce) {
        await emitPresence(slug);
        await announceJoin(slug, data);
      }

      if (data.admin && isAdminRoom(slug)) {
        socket.emit("crowd:state", { roomSlug: slug, ...crowd.state(slug) });
      }

      const history = await getHistory(slug).catch((error) => {
        log.error("Failed to read room history", error);
        return [];
      });
      return { ok: true as const, roomSlug: slug, history };
    }

    async function joinRoom(payload: unknown, ack?: Ack, queueIfFull = false) {
      const reply = ackOf(ack);
      const slug = stringField(payload, "slug");
      const room =
        (await getCachedPublicRooms()).find(
          (candidate) => candidate.slug === slug,
        ) ?? (data.admin ? adminRoomOf(slug) : undefined);

      if (!room) return reply({ ok: false, error: "room_not_found" });

      const outcome = await withRoomLock(slug, async () => {
        const outcome = await tryJoinRoom(room);
        if (outcome !== "room_full" || !queueIfFull) return outcome;

        let queue = roomQueues.get(slug);
        if (!queue?.has(socket.id)) {
          removeFromQueue(socket.id);
          queue = roomQueues.get(slug) ?? new Map<string, QueueEntry>();
          const entry: QueueEntry = {
            ahead:
              data.admin && queueTest.enabled && isAdminRoom(slug)
                ? queueTest.ahead
                : 0,
            admit: async () => {
              const result = await tryJoinRoom(room, entry);
              if (result === "room_full") return false;
              if (result === "joined") {
                socket.emit("room:joined", await joinedRoom(slug, true));
              } else {
                removeFromQueue(socket.id);
                if (result === "nickname_taken")
                  socket.emit("room:queue:error", {
                    roomSlug: slug,
                    error: result,
                  });
              }
              return true;
            },
          };
          queue.set(socket.id, entry);
          roomQueues.set(slug, queue);
        }
        notifyQueue(slug);
        return "queued" as const;
      });

      if (outcome === "queued") {
        const position =
          [...(roomQueues.get(slug)?.keys() ?? [])].indexOf(socket.id) +
          1 +
          (roomQueues.get(slug)?.get(socket.id)?.ahead ?? 0);
        return reply({ ok: true, queued: true, roomSlug: slug, position });
      }

      if (outcome === "room_full") {
        return reply({ ok: false, error: "room_full" });
      }

      if (outcome === "nickname_taken") {
        return reply({ ok: false, error: "nickname_taken" });
      }

      if (outcome === "disconnected" || outcome === "cancelled")
        return reply({ ok: false, error: "connection_lost" });

      reply(await joinedRoom(slug, outcome === "joined"));
    }

    socket.on("room:join", (payload: unknown, ack?: Ack) =>
      joinRoom(payload, ack),
    );
    socket.on("room:queue:join", (payload: unknown, ack?: Ack) =>
      joinRoom(payload, ack, true),
    );

    socket.on("room:queue:leave", (_payload: unknown, ack?: Ack) => {
      removeFromQueue(socket.id);
      ackOf(ack)({ ok: true });
    });

    socket.on("room:leave", async (_payload: unknown, ack?: Ack) => {
      removeFromQueue(socket.id);
      await leaveRoom();
      if (typeof ack === "function") ack({ ok: true });
    });

    // The testing tools of an admin. Anybody else is told no, as if there were nothing to ask for.
    function adminTool(
      event: string,
      run: (
        slug: string,
        payload: unknown,
      ) => Promise<string | void> | string | void,
      { inTestRoom = true }: { inTestRoom?: boolean } = {},
    ) {
      socket.on(event, async (payload: unknown, ack?: Ack) => {
        const reply = ackOf(ack);

        if (!data.admin) return reply({ ok: false, error: "forbidden" });

        // A test room can be named, to use the tools from outside it.
        const named = stringField(payload, "slug");
        const slug = isAdminRoom(named) ? named : (data.roomSlug ?? "");

        if (inTestRoom && !isAdminRoom(slug)) {
          return reply({ ok: false, error: "not_in_test_room" });
        }

        const failure = await run(slug, payload);

        reply(failure ? { ok: false, error: failure } : { ok: true });
      });
    }

    adminTool(
      "admin:queue:settings",
      (_slug, payload) => {
        const { enabled, ahead } = (payload ?? {}) as {
          enabled?: unknown;
          ahead?: unknown;
        };
        if (
          typeof enabled !== "boolean" ||
          typeof ahead !== "number" ||
          !Number.isSafeInteger(ahead) ||
          ahead < 0 ||
          ahead > 1000
        )
          return "invalid_request";
        queueTest = { enabled, ahead };
        socket.emit("admin:queue:state", queueTest);
        for (const [slug, queue] of roomQueues) {
          const entry = queue.get(socket.id);
          if (!entry) continue;
          entry.ahead = enabled && isAdminRoom(slug) ? ahead : 0;
          notifyQueue(slug);
          drainQueue(slug);
        }
      },
      { inTestRoom: false },
    );

    adminTool("admin:queue:advance", (slug) =>
      withRoomLock(slug, async () => {
        const entry = roomQueues.get(slug)?.get(socket.id);
        if (!queueTest.enabled || !entry) return "invalid_request";
        if (entry.ahead > 0) {
          entry.ahead -= 1;
          notifyQueue(slug);
        } else {
          const made = fakeMembers.get(slug) ?? [];
          const who = made.at(-1);
          if (who) {
            fakeMembers.set(slug, made.slice(0, -1));
            crowd.release(slug, who.guestId);
            announceFake(slug, "left", who);
            await emitPresence(slug);
          }
        }
        drainQueue(slug);
      }),
    );

    adminTool("admin:room:limit", (slug, payload) =>
      withRoomLock(slug, async () => {
        const maxMembers = (payload as { maxMembers?: unknown } | null)
          ?.maxMembers;
        const room = adminRoomOf(slug);
        if (
          !room ||
          typeof maxMembers !== "number" ||
          !Number.isSafeInteger(maxMembers) ||
          maxMembers < 1 ||
          maxMembers > 1000
        )
          return "invalid_room_limit";
        if (maxMembers < (await peopleIn(slug)))
          return "room_limit_below_occupancy";
        room.maxMembers = maxMembers;
        io.to(ADMIN_KEY).emit("admin:rooms", { rooms: adminRooms });
        drainQueue(slug);
      }),
    );

    // How many more people the room has room for; a room with no limit takes five at a time.
    async function freeSeats(slug: string): Promise<number> {
      const seats = await seatsLeft(slug);

      return Number.isFinite(seats) ? seats : 5;
    }

    async function addFake(
      slug: string,
      count: number,
    ): Promise<string | void> {
      const seats = Math.min(count, await freeSeats(slug));

      if (seats <= 0) return "room_full";

      for (let i = 0; i < seats; i++) {
        const made = fakeMembers.get(slug) ?? [];
        const real = (await io.in(roomKey(slug)).fetchSockets()).map(
          (member) => (member.data as SocketData).nickname,
        );
        const who = fakeMember([...made.map((m) => m.nickname), ...real]);

        fakeMembers.set(slug, [...made, who]);
        announceFake(slug, "joined", who);
      }

      await emitPresence(slug);
    }

    adminTool("admin:fake:add", (slug) => addFake(slug, 1));

    adminTool("admin:fake:fill", async (slug) => {
      const seats = await freeSeats(slug);

      if (seats <= 0) return "room_full";

      return addFake(slug, seats);
    });

    adminTool("admin:fake:remove", async (slug) => {
      const made = fakeMembers.get(slug) ?? [];
      const who = made[made.length - 1];

      if (!who) return "nobody";

      fakeMembers.set(slug, made.slice(0, -1));
      crowd.release(slug, who.guestId);
      announceFake(slug, "left", who);
      await emitPresence(slug);
    });

    adminTool("admin:fake:clear", async (slug) => {
      await crowd.stop(slug);
      fakeMembers.delete(slug);
      await emitPresence(slug);
    });

    // A crowd takes no more than the room holds.
    const peopleOf = (slug: string, payload: unknown) => {
      const people = Number((payload as { people?: unknown } | null)?.people);
      const limit = adminRoomOf(slug)?.maxMembers;

      return Number.isInteger(people) &&
        people >= 1 &&
        people <= Math.min(limit ?? MAX_CROWD, MAX_CROWD)
        ? people
        : undefined;
    };

    // The crowd: people who write and react by themselves, started, paused and stopped from the admin's menu.
    adminTool("admin:crowd:start", (slug, payload) => {
      const people = peopleOf(slug, payload);

      return people ? crowd.start(slug, people) : "invalid_people";
    });

    adminTool("admin:crowd:people", (slug, payload) => {
      const people = peopleOf(slug, payload);

      return people ? crowd.setPeople(slug, people) : "invalid_people";
    });

    adminTool("admin:crowd:pause", (slug) => crowd.pause(slug));
    adminTool("admin:crowd:resume", (slug) => crowd.resume(slug));
    adminTool("admin:crowd:stop", (slug) => crowd.stop(slug));

    // What a guest is told when the server removes them, for each reason it does; the admin stays connected.
    adminTool(
      "admin:kick",
      (_slug, payload) => {
        const reason = stringField(payload, "reason");

        if (!KICK_REASONS.includes(reason)) return "invalid_reason";

        socket.emit("kicked", { reason });
      },
      { inTestRoom: false },
    );

    socket.on("message:send", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);
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
        log.error("Failed to read the room's settings", error);
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
        ...pictureOf(data),
        text,
        sentAt: new Date(now).toISOString(),
      };

      // Recorded before it is delivered, so whatever a guest has seen live is also in the history a later joiner
      // reads. The stored copy also names the sender's IP hash so a later ban can reach it; that never leaves the
      // server. Roles that ignore IP bans store none, so a ban on a shared address cannot touch their messages. A
      // Redis failure costs the history entry, not the message.
      const storedIpHash = ROLE_RULES[data.role].ignoresIpBans
        ? ""
        : data.identityHash;

      try {
        await recordMessage({ ...message, ipHash: storedIpHash });
      } catch (error) {
        log.error("Failed to record message", error);
      }

      // A ban can land while the message is being recorded: it is neither delivered nor left in the history.
      if (data.banned) {
        await redactMessagesFrom(message.roomSlug, [data.identityHash]).catch(
          (error) =>
            log.error("Failed to replace a banned guest's message", error),
        );
        return reply({ ok: false, error: "banned" });
      }

      io.to(roomKey(message.roomSlug)).emit("message:new", message);
      crowd.heard(message.roomSlug, message);

      reply({ ok: true });
    });

    // Adds the guest's reaction to a message in their room, or removes it if they had already made it.
    socket.on("reaction:toggle", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);
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
      const reactionWait = reactionWaitMs(data, now);

      if (reactionWait > 0) {
        return reply({
          ok: false,
          error: "rate_limited",
          retryAfterMs: reactionWait,
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
        log.error("Failed to record a reaction", error);
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

    // Reports a message in the guest's room. Enough different addresses hide it for everybody (at once when a moderator
    // reports it); the admin keeps a copy of what was reported, for a moderator to judge.
    socket.on("message:report", async (payload: unknown, ack?: Ack) => {
      const reply = ackOf(ack);
      const slug = data.roomSlug;

      if (!slug) {
        return reply({ ok: false, error: "not_in_room" });
      }

      const messageId = stringField(payload, "messageId");
      const reason = stringField(payload, "reason") || "other";

      if (
        !messageId ||
        messageId.length > 64 ||
        !REPORT_REASONS.includes(reason as ReportReason)
      ) {
        return reply({ ok: false, error: "invalid_report" });
      }

      const now = Date.now();
      const { recent, waitMs } = slidingWindow(
        data.reportTimes,
        now,
        REPORT_WINDOW_MS,
        REPORTS_PER_WINDOW,
      );
      data.reportTimes = recent;

      if (waitMs > 0) {
        return reply({
          ok: false,
          error: "rate_limited",
          retryAfterMs: waitMs,
        });
      }

      data.reportTimes.push(now);

      let result;

      try {
        result = await reportMessage(
          slug,
          messageId,
          { guestId: data.guestId, ipHash: data.identityHash },
          {
            hideAt: env.REPORT_HIDE_THRESHOLD,
            hideNow: data.role === "moderator",
          },
        );
      } catch (error) {
        log.error("Failed to record a report", error);
        return reply({ ok: false, error: "unavailable" });
      }

      if (!result.ok) {
        return reply({
          ok: false,
          error: result.reason === "own" ? "own_message" : "message_not_found",
        });
      }

      const { report } = result;

      if (report.hidden) {
        io.to(roomKey(slug)).emit("message:hidden", {
          roomSlug: slug,
          id: messageId,
        });
      }

      if (report.added) {
        recordReport({
          messageId,
          roomSlug: slug,
          text: report.text,
          nickname: report.nickname,
          guestId: report.guestId,
          senderHash: report.ipHash,
          reporterCount: report.count,
          hidden: report.hidden,
          reason: reason as ReportReason,
        });
      }

      reply({ ok: true, hidden: report.hidden });
    });

    socket.on("disconnect", () => {
      idleTimers.forEach(clearTimeout);
      removeFromQueue(socket.id);

      // Socket.IO has already removed the socket from its rooms; just refresh presence for the others.
      if (data.roomSlug) {
        announceLeave(data.roomSlug, data);
        emitPresence(data.roomSlug).catch((error) =>
          log.error("Presence update failed", error),
        );
      }

      // The last admin gone leaves the test rooms' people with nobody to see them.
      if (data.admin) {
        for (const { slug } of ADMIN_ROOMS) {
          if (slug === data.roomSlug) continue;

          void io
            .in(roomKey(slug))
            .fetchSockets()
            .then((members) =>
              members.length === 0 ? dropShow(slug) : undefined,
            )
            .catch((error) => log.error("Presence update failed", error));
        }
      }
    });
  });

  return io;
}

// How many are in each room, across all nodes; a room nobody is in is left out.
export async function roomOccupancy(io: Server): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const prefix = roomKey("");

  for (const socket of await io.fetchSockets()) {
    if ((socket.data as SocketData).role === "moderator") continue;
    for (const key of socket.rooms) {
      if (!key.startsWith(prefix)) continue;

      const slug = key.slice(prefix.length);
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return counts;
}

// Cuts off whatever is connected as an account that has just been deleted.
export async function removeAccountConnections(
  io: Server,
  memberId: number,
): Promise<void> {
  for (const socket of await io.fetchSockets()) {
    if ((socket.data as SocketData).memberId !== memberId) continue;

    socket.emit("kicked", { reason: "invalid_token" });
    socket.disconnect(true);
  }
}

export async function enforceMembers(
  io: Server,
  memberIds: number[],
): Promise<void> {
  const allowed = new Set(memberIds);

  for (const socket of io.sockets.sockets.values()) {
    const { memberId } = socket.data as SocketData;

    if (memberId === undefined || allowed.has(memberId)) continue;

    socket.emit("kicked", { reason: "invalid_token" });
    socket.disconnect(true);
  }
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
    if (
      (!banned.has(data.ipHash) && !banned.has(data.identityHash)) ||
      ROLE_RULES[data.role].ignoresIpBans
    ) {
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
      log.error("Failed to replace messages", error, { room: room.slug });
    }
  }
}
