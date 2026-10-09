import { useCallback, useEffect, useRef, useState } from "react";

import {
  addDirectMessage,
  applyPresence,
  markReturned,
  markRead,
  parseDirectMessage,
  redactDirect,
  type DirectThread,
  type Partner,
} from "./direct";
import { movements, type RoomEvent } from "./roomEvents";
import { loadNotifyDirect, saveNotifyDirect } from "../preferences";
import { parseAvatar, type Avatar } from "./avatar";
import {
  createSocket as defaultCreateSocket,
  type ChatSocket,
  type CreateSocket,
  type Resume,
} from "./socket";

export type { Avatar } from "./avatar";
export type {
  DirectEntry,
  DirectMessage,
  DirectStatus,
  DirectThread,
  Partner,
} from "./direct";

export type Role = "guest" | "moderator";

export interface Session {
  guestId: string;
  nickname: string;
  role?: Role;
  avatar?: Avatar;
  resumeSecret?: string;
}

export interface Member {
  guestId: string;
  nickname: string;
  role?: Role;
  avatar?: Avatar;
}

export interface ChatMessage {
  id: string;
  roomSlug: string;
  guestId: string;
  nickname: string;
  text: string;
  sentAt: string;
  // Who the server says sent it; absent means an ordinary guest.
  role?: Role;
  avatar?: Avatar;
  // The guest's place in what arrived live (see roomEvents.ts); not sent by the server.
  seq?: number;
  // The author was banned: the text and name are gone and only a placeholder is shown.
  banned?: boolean;
}

export type ChatStatus = "idle" | "connecting" | "connected" | "reconnecting";

export interface ConnectOptions {
  // A moderator's signed token, in place of a nickname.
  token?: string;
  avatar?: Avatar;
  // The ids this guest had on earlier connections (before a reload), so what they wrote is still theirs.
  previousGuestIds?: string[];
  // The identity to take over, when this is the same guest on a new page load.
  resume?: Resume;
  // What the guest had open before a reload.
  threads?: DirectThread[];
  blockedIds?: string[];
  // The conversation that was open, to be open again if that person is still in the room.
  openGuestId?: string;
}

// What a moderator told everyone.
export interface Announcement {
  id: string;
  text: string;
  sentAt: string;
  name: string;
}

export type ActionResult =
  { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };
export type AnnounceResult = ActionResult;

type Ack =
  | { ok: true; history?: unknown }
  | { ok: false; error: string; retryAfterMs?: number };
type DropHandler = (reason: string) => void;

function toResult(ack: Ack): ActionResult {
  if (ack.ok) return { ok: true };

  return {
    ok: false,
    error: ack.error,
    retryAfterSeconds: ack.retryAfterMs
      ? Math.ceil(ack.retryAfterMs / 1000)
      : undefined,
  };
}

const MAX_MESSAGES = 200;
const MAX_ROOM_EVENTS = 200;
// About four minutes of trying, never more than 30 seconds apart: long enough for a server restart or a patchy
// network, and a tab in the background has its timers slowed down by the browser anyway.
export const DEFAULT_RECONNECT_DELAYS_MS = [
  1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 30_000, 30_000, 30_000, 30_000,
  30_000, 30_000,
];

// Waits out a delay, but not when the browser says the network is back or the guest has returned to the tab: that is
// the moment a retry is most likely to work, and a background tab's timers may have been held up.
function waitOrWake(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      document.removeEventListener("visibilitychange", onVisibility);
      resolve();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") done();
    };
    const timer = setTimeout(done, ms);

    window.addEventListener("online", done);
    document.addEventListener("visibilitychange", onVisibility);
  });
}
// Errors the server reports in connect_error; anything else (network failure, CORS) is a connection problem.
const HANDSHAKE_ERRORS = new Set([
  "invalid_nickname",
  "reserved_nickname",
  "invalid_token",
  "banned",
  "unavailable",
  "too_many_connections",
]);
// Rejections that retrying cannot fix. A full per-network limit is not one: the guest's own dropped connection may
// still be counted for a while.
const PERMANENT_ERRORS = new Set([
  "invalid_nickname",
  "reserved_nickname",
  "invalid_token",
  "banned",
]);
// Disconnects somebody chose (this client, or the server kicking the guest); everything else is a dropped connection.
const DELIBERATE_DISCONNECTS = new Set([
  "io client disconnect",
  "io server disconnect",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function placeholderFor(message: {
  id: string;
  roomSlug: string;
  sentAt: string;
}): ChatMessage {
  return {
    id: message.id,
    roomSlug: message.roomSlug,
    sentAt: message.sentAt,
    guestId: "",
    nickname: "",
    text: "",
    banned: true,
  };
}

// A message as the server sends it: either a full message or, once its author was banned, a bare placeholder.
function parseMessage(value: unknown): ChatMessage | undefined {
  if (!isRecord(value)) return undefined;
  const { id, roomSlug, sentAt } = value;

  if (
    typeof id !== "string" ||
    typeof roomSlug !== "string" ||
    typeof sentAt !== "string"
  ) {
    return undefined;
  }

  if (value.banned === true) return placeholderFor({ id, roomSlug, sentAt });

  const { guestId, nickname, text } = value;

  if (
    typeof guestId !== "string" ||
    typeof nickname !== "string" ||
    typeof text !== "string"
  ) {
    return undefined;
  }

  return {
    id,
    roomSlug,
    guestId,
    nickname,
    text,
    sentAt,
    role: value.role === "moderator" ? "moderator" : "guest",
    avatar: parseAvatar(value.avatar),
  };
}

function parseAnnouncement(value: unknown): Announcement | undefined {
  if (!isRecord(value)) return undefined;
  const { id, text, sentAt, name } = value;

  if (
    typeof id !== "string" ||
    typeof text !== "string" ||
    typeof sentAt !== "string" ||
    typeof name !== "string"
  ) {
    return undefined;
  }

  return { id, text, sentAt, name };
}

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0;

// The server's remembered messages for the room, merged into what is already on screen. The same message can arrive
// both live and in the history, so ids decide what is new; timestamps keep the whole list in the order it was sent.
// A placeholder in the history wins over a copy that was delivered live: it is the newer news.
function mergeHistory(
  existing: ChatMessage[],
  history: unknown,
  roomSlug: string,
): ChatMessage[] {
  if (!Array.isArray(history)) return existing;

  const byId = new Map(existing.map((message) => [message.id, message]));
  let changed = false;

  for (const entry of history) {
    const message = parseMessage(entry);
    if (!message || message.roomSlug !== roomSlug) continue;

    const current = byId.get(message.id);

    if (!current || (message.banned && !current.banned)) {
      byId.set(message.id, message);
      changed = true;
    }
  }

  if (!changed) return existing;

  return [...byId.values()].sort(byTime).slice(-MAX_MESSAGES);
}

function strings(value: unknown): Set<string> {
  return new Set(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  );
}

// The server banned someone: their messages, named by id or by the guest they were sent as, turn into placeholders.
function applyRedaction(
  existing: ChatMessage[],
  notice: unknown,
  roomSlug: string | null,
): ChatMessage[] {
  if (!isRecord(notice) || notice.roomSlug !== roomSlug) return existing;

  const ids = strings(notice.ids);
  const guestIds = strings(notice.guestIds);
  guestIds.delete("");

  if (ids.size === 0 && guestIds.size === 0) return existing;

  return existing.map((message) =>
    !message.banned &&
    message.roomSlug === roomSlug &&
    (ids.has(message.id) || guestIds.has(message.guestId))
      ? placeholderFor(message)
      : message,
  );
}

export function useChat(
  createSocket: CreateSocket = defaultCreateSocket,
  options: { reconnectDelaysMs?: number[] } = {},
) {
  const socketRef = useRef<ChatSocket | null>(null);
  const roomRef = useRef<string | null>(null);
  const nicknameRef = useRef<string | null>(null);
  // Proof that a moderator signed in, kept so a dropped connection can be restored without asking again.
  const tokenRef = useRef<string | null>(null);
  // What the guest chose to be shown as; sent again when the connection is restored.
  const avatarRef = useRef<Avatar | null>(null);
  // Lets a new connection (a dropped one restored, or a reloaded page) be the same guest as the one before it.
  const resumeRef = useRef<Resume | null>(null);
  // Which room the last list of people was for, so a different room's list is not mistaken for people leaving.
  const presenceRoomRef = useRef<string | null>(null);
  // Bumped to cancel a reconnect loop in progress.
  const reconnectRunRef = useRef(0);
  const reconnectingRef = useRef(false);
  const delaysRef = useRef(
    options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS,
  );

  const [status, setStatus] = useState<ChatStatus>("idle");
  const [session, setSession] = useState<Session | null>(null);
  // The server issues a new guest id per connection, so earlier messages stay recognisable as ours.
  const [ownGuestIds, setOwnGuestIds] = useState<string[]>([]);
  const ownGuestIdsRef = useRef<string[]>([]);
  const [roomSlug, setRoomSlug] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomEvents, setRoomEvents] = useState<RoomEvent[]>([]);
  // Counts what arrives live, so messages and events can be put in the order they came.
  const arrivalRef = useRef(0);
  const lastMembersRef = useRef<Member[]>([]);
  // Guests banned while here: nothing about them is announced.
  const bannedGuestIdsRef = useRef(new Set<string>());
  // A conversation restored after a reload stays open only if the other person turns out to be in the room.
  const restoredPartnerRef = useRef<string | null>(null);
  // Direct messages live only as long as the connection: guests are new people every time they connect.
  const [threads, setThreads] = useState<DirectThread[]>([]);
  // Who the guest has open, whether or not anything has been said yet.
  const [partner, setPartner] = useState<Partner | null>(null);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  // Whether a new direct message counts as unread; switched off, nothing is counted and nothing lights up.
  const [notify, setNotifyState] = useState(loadNotifyDirect);
  const notifyRef = useRef(notify);
  const partnerRef = useRef<Partner | null>(null);
  const blockedRef = useRef<string[]>([]);
  const membersRef = useRef<Member[]>([]);
  const selfGuestIdRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // The server repeats the latest announcement on every connection; one that was dismissed must not return.
  const dismissedAnnouncementRef = useRef<string | null>(null);
  // Holds a translation key under `errors.` (a server error code, "connection" or "connection_lost").
  const [error, setError] = useState<string | null>(null);
  // How long the server said to wait after refusing a message, rounded up to whole seconds.
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(
    null,
  );

  useEffect(() => {
    delaysRef.current =
      options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
  }, [options.reconnectDelaysMs]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const resetRoom = useCallback(() => {
    roomRef.current = null;
    partnerRef.current = null;
    presenceRoomRef.current = null;
    restoredPartnerRef.current = null;
    lastMembersRef.current = [];
    bannedGuestIdsRef.current = new Set();
    setPartner(null);
    setRoomSlug(null);
    setMembers([]);
    setMessages([]);
    setRoomEvents([]);
  }, []);

  const cancelReconnect = useCallback(() => {
    reconnectRunRef.current += 1;
    reconnectingRef.current = false;
  }, []);

  // Drops the current socket without its disconnect handler treating that as a lost connection.
  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.disconnect();
  }, []);

  const resetConnection = useCallback(() => {
    setStatus("idle");
    setSession(null);
    setAnnouncement(null);
    setThreads([]);
    blockedRef.current = [];
    setBlockedIds([]);
    resetRoom();
  }, [resetRoom]);

  // Resolves with null once the server has accepted the guest, or with the reason it was not.
  const openSocket = useCallback(
    (nickname: string, onDrop: DropHandler): Promise<string | null> => {
      const token = tokenRef.current;
      const avatar = avatarRef.current;
      const resume = resumeRef.current;
      // Trailing arguments that are not needed are left off, so a plain guest's call is just the nickname.
      const args: [string, string?, Avatar?, Resume?] = [
        nickname,
        token ?? undefined,
        avatar ?? undefined,
        resume ?? undefined,
      ];
      while (args.length > 1 && args[args.length - 1] === undefined) args.pop();
      const socket = createSocket(...args);
      socketRef.current = socket;
      const isCurrent = () => socketRef.current === socket;

      return new Promise((resolve) => {
        socket.on("session", (next: Session) => {
          if (!isCurrent()) return;
          selfGuestIdRef.current = next.guestId;
          // Same guest as before: whoever they were talking to saw them leave and come back.
          if (resume?.guestId === next.guestId) {
            setThreads((previous) =>
              markReturned(previous, new Date().toISOString(), () =>
                crypto.randomUUID(),
              ),
            );
          }
          // Each connection gets a new secret; this is the one the next connection has to present.
          resumeRef.current = next.resumeSecret
            ? { guestId: next.guestId, secret: next.resumeSecret }
            : null;
          // The server forgets who was blocked when a connection ends, so a new one is told again.
          for (const guestId of blockedRef.current) {
            socket.emit("dm:block", { guestId });
          }
          setSession(next);
          if (!ownGuestIdsRef.current.includes(next.guestId)) {
            ownGuestIdsRef.current = [...ownGuestIdsRef.current, next.guestId];
          }
          setOwnGuestIds(ownGuestIdsRef.current);
          resolve(null);
        });

        socket.on("connect_error", (cause: Error) => {
          if (!isCurrent()) return;
          closeSocket();
          resolve(
            HANDSHAKE_ERRORS.has(cause.message) ? cause.message : "connection",
          );
        });

        socket.on(
          "room:presence",
          (presence: { roomSlug: string; members: Member[] }) => {
            if (isCurrent() && presence.roomSlug === roomRef.current) {
              setMembers(presence.members);

              const silent = presenceRoomRef.current !== presence.roomSlug;
              const before = lastMembersRef.current;
              presenceRoomRef.current = presence.roomSlug;
              lastMembersRef.current = presence.members;

              if (!silent) {
                const added = movements(
                  before,
                  presence.members,
                  selfGuestIdRef.current,
                  presence.roomSlug,
                  new Date().toISOString(),
                  () => ++arrivalRef.current,
                  () => crypto.randomUUID(),
                ).filter(
                  (event) => !bannedGuestIdsRef.current.has(event.guestId),
                );

                if (added.length > 0) {
                  setRoomEvents((previous) =>
                    [...previous, ...added].slice(-MAX_ROOM_EVENTS),
                  );
                }
              }

              // The conversation from before the reload is only carried on with somebody who is here.
              const restored = restoredPartnerRef.current;
              if (restored) {
                restoredPartnerRef.current = null;

                if (
                  !presence.members.some(
                    (member) => member.guestId === restored,
                  )
                ) {
                  partnerRef.current = null;
                  setPartner(null);
                }
              }
              setThreads((previous) =>
                applyPresence(
                  previous,
                  new Set(presence.members.map((member) => member.guestId)),
                  new Date().toISOString(),
                  silent,
                  () => crypto.randomUUID(),
                ),
              );
            }
          },
        );

        socket.on("message:new", (message: ChatMessage) => {
          if (isCurrent() && message.roomSlug === roomRef.current) {
            const live = { ...message, seq: ++arrivalRef.current };
            // Already known, e.g. it came with the history or was since replaced by a placeholder.
            setMessages((previous) =>
              previous.some((known) => known.id === message.id)
                ? previous
                : [...previous, live].slice(-MAX_MESSAGES),
            );
          }
        });

        socket.on("announcement:new", (value: unknown) => {
          const next = parseAnnouncement(value);

          if (
            isCurrent() &&
            next &&
            next.id !== dismissedAnnouncementRef.current
          ) {
            setAnnouncement(next);
          }
        });

        socket.on("dm:new", (value: unknown) => {
          const message = parseDirectMessage(value);
          if (!isCurrent() || !message) return;

          const mine = message.fromGuestId === selfGuestIdRef.current;
          const known = membersRef.current.find(
            (member) => member.guestId === message.toGuestId,
          );
          const other: Partner = mine
            ? {
                guestId: message.toGuestId,
                nickname: message.toNickname,
                role: known?.role ?? "guest",
                avatar: message.toAvatar,
              }
            : {
                guestId: message.fromGuestId,
                nickname: message.fromNickname,
                role: message.fromRole,
                avatar: message.fromAvatar,
              };
          const viewing = partnerRef.current?.guestId === other.guestId;

          // Writing back to somebody means their messages have been read.
          setThreads((previous) => {
            const next = addDirectMessage(
              previous,
              other,
              message,
              !mine && !viewing && notifyRef.current,
            );

            return mine ? markRead(next, other.guestId) : next;
          });
        });

        socket.on("message:redacted", (notice: unknown) => {
          if (!isCurrent()) return;
          setThreads((previous) => redactDirect(previous, notice));
          // Their name goes from the messages, so it must not stay in the lines about them coming and going.
          const banned = strings(isRecord(notice) ? notice.guestIds : []);
          banned.delete("");
          if (banned.size > 0) {
            for (const id of banned) bannedGuestIdsRef.current.add(id);
            setRoomEvents((previous) =>
              previous.filter((event) => !banned.has(event.guestId)),
            );
          }
          setMessages((previous) =>
            applyRedaction(previous, notice, roomRef.current),
          );
        });

        socket.on("kicked", (payload: { reason: string }) => {
          if (isCurrent()) setError(payload.reason);
        });

        socket.on("disconnect", (reason: string) => {
          if (!isCurrent()) return;
          socketRef.current = null;
          onDrop(reason);
        });
      });
    },
    [closeSocket, createSocket],
  );

  const emitWithAck = useCallback(
    (event: string, payload?: unknown): Promise<Ack> => {
      const socket = socketRef.current;

      if (!socket || reconnectingRef.current) {
        return Promise.resolve({ ok: false, error: "connection_lost" });
      }

      return new Promise((resolve) => socket.emit(event, payload, resolve));
    },
    [],
  );

  // Guests get a new identity on every connection, so recovering means connecting again and rejoining the room.
  const reconnect = useCallback(
    async (nickname: string, onDrop: DropHandler): Promise<void> => {
      cancelReconnect();
      const run = reconnectRunRef.current;
      const cancelled = () => reconnectRunRef.current !== run;

      reconnectingRef.current = true;
      setStatus("reconnecting");

      const giveUp = (reason: string) => {
        reconnectingRef.current = false;
        resetConnection();
        setError(reason);
      };

      for (const delay of delaysRef.current) {
        await waitOrWake(delay);
        if (cancelled()) return;

        const failure = await openSocket(nickname, onDrop);
        if (cancelled()) return;

        if (failure === null) {
          reconnectingRef.current = false;
          setStatus("connected");

          const slug = roomRef.current;
          if (!slug) return;

          const ack = await emitWithAck("room:join", { slug });
          if (cancelled()) return;

          if (!ack.ok) {
            resetRoom();
            setError(ack.error);
          } else {
            setMessages((existing) =>
              mergeHistory(existing, ack.history, slug),
            );
          }
          return;
        }

        if (PERMANENT_ERRORS.has(failure)) return giveUp(failure);
      }

      giveUp("connection_lost");
    },
    [cancelReconnect, emitWithAck, openSocket, resetConnection, resetRoom],
  );

  const handleDrop = useCallback(
    function handleDrop(reason: string) {
      const nickname = nicknameRef.current;

      // Nothing to recover when the guest was only browsing the lobby.
      if (!DELIBERATE_DISCONNECTS.has(reason) && roomRef.current && nickname) {
        void reconnect(nickname, handleDrop);
        return;
      }

      resetConnection();
    },
    [reconnect, resetConnection],
  );

  const connect = useCallback(
    async (
      nickname: string,
      options: ConnectOptions = {},
    ): Promise<boolean> => {
      const { token, avatar, previousGuestIds = [], resume } = options;

      cancelReconnect();
      closeSocket();
      setError(null);
      resumeRef.current = resume ?? null;
      ownGuestIdsRef.current = previousGuestIds;
      setOwnGuestIds(previousGuestIds);
      setThreads(options.threads ?? []);
      blockedRef.current = options.blockedIds ?? [];
      setBlockedIds(blockedRef.current);
      const open = options.threads?.find(
        (thread) => thread.guestId === options.openGuestId,
      );
      partnerRef.current = open
        ? {
            guestId: open.guestId,
            nickname: open.nickname,
            role: open.role,
            avatar: open.avatar,
          }
        : null;
      restoredPartnerRef.current = open ? open.guestId : null;
      setPartner(partnerRef.current);
      setStatus("connecting");
      nicknameRef.current = nickname;
      tokenRef.current = token ?? null;
      avatarRef.current = avatar ?? null;

      const failure = await openSocket(nickname, handleDrop);

      if (failure) {
        setStatus("idle");
        setError(failure);
        return false;
      }

      setStatus("connected");
      return true;
    },
    [cancelReconnect, closeSocket, handleDrop, openSocket],
  );

  const joinRoom = useCallback(
    async (slug: string): Promise<boolean> => {
      setError(null);

      // The server sends presence (and possibly messages) before it acknowledges the join, so the room must be
      // current by the time they arrive. It is restored below if the join is refused.
      const previous = roomRef.current;
      roomRef.current = slug;

      const ack = await emitWithAck("room:join", { slug });

      if (!ack.ok) {
        roomRef.current = previous;
        setError(ack.error);
        // Whatever was restored for that room has nowhere to go.
        if (restoredPartnerRef.current) {
          restoredPartnerRef.current = null;
          partnerRef.current = null;
          setPartner(null);
        }
        return false;
      }

      setRoomEvents((existing) =>
        existing.filter((event) => event.roomSlug === slug),
      );
      setMessages((existing) =>
        mergeHistory(
          existing.filter((message) => message.roomSlug === slug),
          ack.history,
          slug,
        ),
      );
      setRoomSlug(slug);
      return true;
    },
    [emitWithAck],
  );

  const disconnect = useCallback(() => {
    cancelReconnect();
    closeSocket();
    resetConnection();
  }, [cancelReconnect, closeSocket, resetConnection]);

  const leaveRoom = useCallback(async (): Promise<void> => {
    // There is no connection to leave from while reconnecting, so just stop trying.
    if (reconnectingRef.current) {
      disconnect();
      return;
    }

    cancelReconnect();
    await emitWithAck("room:leave");
    resetRoom();
  }, [cancelReconnect, disconnect, emitWithAck, resetRoom]);

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      setError(null);
      setRetryAfterSeconds(null);
      const ack = await emitWithAck("message:send", { text });

      if (!ack.ok) {
        setError(ack.error);
        if (ack.retryAfterMs) {
          setRetryAfterSeconds(Math.ceil(ack.retryAfterMs / 1000));
        }
      }
      return ack.ok;
    },
    [emitWithAck],
  );

  const sendAnnouncement = useCallback(
    async (text: string): Promise<AnnounceResult> =>
      toResult(await emitWithAck("announce:send", { text })),
    [emitWithAck],
  );

  const openDirect = useCallback((next: Partner) => {
    partnerRef.current = next;
    setPartner(next);
    setThreads((previous) => markRead(previous, next.guestId));
  }, []);

  const setMuted = useCallback((guestId: string, muted: boolean) => {
    setThreads((previous) =>
      previous.map((thread) =>
        thread.guestId === guestId
          ? {
              ...thread,
              muted: muted || undefined,
              unread: muted ? 0 : thread.unread,
            }
          : thread,
      ),
    );
  }, []);

  const setNotify = useCallback((on: boolean) => {
    notifyRef.current = on;
    setNotifyState(on);
    saveNotifyDirect(on);

    if (!on) {
      setThreads((previous) =>
        previous.some((thread) => thread.unread)
          ? previous.map((thread) =>
              thread.unread ? { ...thread, unread: 0 } : thread,
            )
          : previous,
      );
    }
  }, []);

  const closeDirect = useCallback(() => {
    partnerRef.current = null;
    setPartner(null);
  }, []);

  const sendDirect = useCallback(
    async (toGuestId: string, text: string): Promise<ActionResult> =>
      toResult(await emitWithAck("dm:send", { toGuestId, text })),
    [emitWithAck],
  );

  const setBlocked = useCallback(
    async (guestId: string, blocked: boolean): Promise<ActionResult> => {
      const result = toResult(
        await emitWithAck(blocked ? "dm:block" : "dm:unblock", { guestId }),
      );

      if (result.ok) {
        blockedRef.current = blocked
          ? [...blockedRef.current.filter((id) => id !== guestId), guestId]
          : blockedRef.current.filter((id) => id !== guestId);
        setBlockedIds(blockedRef.current);
        // What they wrote before is not going to be answered from here.
        if (blocked) setThreads((previous) => markRead(previous, guestId));
      }

      return result;
    },
    [emitWithAck],
  );

  const dismissAnnouncement = useCallback(() => {
    setAnnouncement((current) => {
      if (current) dismissedAnnouncementRef.current = current.id;
      return null;
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const activeThread = partner
    ? threads.find((thread) => thread.guestId === partner.guestId)
    : undefined;
  const direct = {
    threads,
    // The conversation that is open; it has no messages until something has been said.
    active: partner
      ? { ...partner, entries: activeThread?.entries ?? [] }
      : null,
    blockedIds,
    open: openDirect,
    close: closeDirect,
    setMuted,
    notify,
    setNotify,
    send: sendDirect,
    setBlocked,
  };

  useEffect(
    () => () => {
      cancelReconnect();
      closeSocket();
    },
    [cancelReconnect, closeSocket],
  );

  return {
    status,
    session,
    ownGuestIds,
    guestIds: () => ownGuestIdsRef.current,
    resume: () => resumeRef.current,
    roomSlug,
    members,
    messages,
    roomEvents: roomEvents.filter((event) => event.roomSlug === roomSlug),
    error,
    retryAfterSeconds,
    announcement,
    direct,
    connect,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendAnnouncement,
    dismissAnnouncement,
    disconnect,
    clearError,
  };
}

export type DirectApi = ReturnType<typeof useChat>["direct"];
