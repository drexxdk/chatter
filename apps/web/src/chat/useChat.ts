import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDirectChat } from "./useDirectChat";
import { useChatProfile } from "./useChatProfile";
import {
  AccountError,
  parseAccountSession,
  type PasswordClaim,
  type Room,
} from "../api";
import {
  eventsFromHistory,
  mergeEvents,
  parseRoomEvent,
  type RoomEvent,
} from "./roomEvents";
import { isRecord } from "../isRecord";
import { MAX_GUEST_IDS } from "../session";
import type { Avatar } from "./avatar";
import {
  applyHidden,
  applyRedaction,
  hideMessage,
  MAX_MESSAGES,
  mergeHistory,
  parseAnnouncement,
  strings,
} from "./messages";
import { parseReactions, type Reaction } from "./reactions";
import {
  DEFAULT_RECONNECT_DELAYS_MS,
  DELIBERATE_DISCONNECTS,
  HANDSHAKE_ERRORS,
  PERMANENT_ERRORS,
  waitOrWake,
} from "./reconnect";
import {
  createSocket as defaultCreateSocket,
  type ChatSocket,
  type CreateSocket,
  type Resume,
} from "./socket";
import {
  toResult,
  type Ack,
  type ActionResult,
  type Announcement,
  type AnnounceResult,
  type ChatMessage,
  type ChatStatus,
  type ConnectOptions,
  type CrowdState,
  type Member,
  type ReportReason,
  type Session,
} from "./types";

export type { Avatar } from "./avatar";
export type {
  DirectEntry,
  DirectMessage,
  DirectStatus,
  DirectThread,
  Partner,
} from "./direct";

export type {
  ActionResult,
  AnnounceResult,
  Announcement,
  ChatMessage,
  ChatStatus,
  ConnectOptions,
  Member,
  Role,
  Session,
} from "./types";
export { DEFAULT_RECONNECT_DELAYS_MS } from "./reconnect";

type DropHandler = (reason: string) => void;

const MAX_ROOM_EVENTS = 200;
// How long reactions that arrive close together wait to be drawn together.
const REACTION_BATCH_MS = 400;

export function useChat(
  createSocket: CreateSocket = defaultCreateSocket,
  options: { reconnectDelaysMs?: number[] } = {},
) {
  const socketRef = useRef<ChatSocket | null>(null);
  const roomRef = useRef<string | null>(null);
  // Proof that a moderator signed in, kept so a dropped connection can be restored without asking again.
  const tokenRef = useRef<string | null>(null);
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
  // Guests banned while here: nothing about them is announced.
  const bannedGuestIdsRef = useRef(new Set<string>());
  const membersRef = useRef<Member[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [announcements, setAnnouncements] = useState<
    (Announcement & { roomSlug: string })[]
  >([]);
  // Only an admin in a test room is told of this.
  const [crowd, setCrowd] = useState<CrowdState | null>(null);
  // How many are in each test room, the people who are not there too; what the list of rooms shows.
  const [adminCounts, setAdminCounts] = useState<Record<string, number>>({});
  // When the server will disconnect the guest for doing nothing, once it has warned them.
  const [idleDeadline, setIdleDeadline] = useState<number | null>(null);
  // The server repeats the latest announcement on every connection; one that was dismissed must not return.
  const dismissedAnnouncementRef = useRef<string | null>(null);
  // Holds a translation key under `errors.` (a server error code, "connection" or "connection_lost").
  const [error, setError] = useState<string | null>(null);
  // How long the server said to wait after refusing a message, rounded up to whole seconds.
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(
    null,
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

  // What an answer to a message or a reaction does to the error shown. It stays until the answer comes: clearing it first
  // and showing it again makes the box under the messages shrink and grow, which moves the chat.
  const settle = useCallback((ack: Ack) => {
    if (ack.ok) {
      setError(null);
      setRetryAfterSeconds(null);
      return;
    }

    setError(ack.error);
    setRetryAfterSeconds(
      ack.retryAfterMs ? Math.ceil(ack.retryAfterMs / 1000) : null,
    );
  }, []);

  const {
    direct,
    getBlockedGuestIds,
    restoreDirect,
    resetDirect,
    resetDirectRoom,
    rejectDirectRestore,
    restoreDirectSession,
    applyDirectPresence,
    receiveDirect,
    receiveDirectReaction,
    receiveDirectBlock,
    redactDirectMessages,
  } = useDirectChat({ emitWithAck, settle, membersRef, ownGuestIdsRef });

  const { getConnectionProfile, rememberConnectionProfile, updateProfile } =
    useChatProfile({ emitWithAck, setSession });

  // The wait counts down, and the error goes when it is over.
  useEffect(() => {
    if (error !== "rate_limited" || !retryAfterSeconds) return;

    const timer = setTimeout(() => {
      if (retryAfterSeconds > 1) {
        setRetryAfterSeconds(retryAfterSeconds - 1);
      } else {
        setError(null);
        setRetryAfterSeconds(null);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [error, retryAfterSeconds]);

  useEffect(() => {
    delaysRef.current =
      options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
  }, [options.reconnectDelaysMs]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  // The events known so far with these added; the same one can come both live and in the history.
  const addRoomEvents = useCallback(
    (added: RoomEvent[]) => {
      const shown = added.filter(
        (event) =>
          !bannedGuestIdsRef.current.has(event.guestId) &&
          !getBlockedGuestIds().includes(event.guestId),
      );
      if (shown.length === 0) return;

      setRoomEvents((previous) =>
        mergeEvents(previous, shown).slice(-MAX_ROOM_EVENTS),
      );
    },
    [getBlockedGuestIds],
  );

  const resetRoom = useCallback(() => {
    roomRef.current = null;
    resetDirectRoom();
    presenceRoomRef.current = null;
    bannedGuestIdsRef.current = new Set();
    setRoomSlug(null);
    setMembers([]);
    setMessages([]);
    setAnnouncements([]);
    setRoomEvents([]);
  }, [resetDirectRoom]);

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
    setCrowd(null);
    setAdminCounts({});
    setIdleDeadline(null);
    resetDirect();
    resetRoom();
  }, [resetDirect, resetRoom]);

  // Resolves with null once the server has accepted the guest, or with the reason it was not.
  const openSocket = useCallback(
    (nickname: string, onDrop: DropHandler): Promise<string | null> => {
      const token = tokenRef.current;
      const { avatar, picture, age } = getConnectionProfile();
      const resume = resumeRef.current;
      // Trailing arguments that are not needed are left off, so a plain guest's call is just the nickname.
      const args: [string, string?, Avatar?, Resume?, number?, string?] = [
        nickname,
        token ?? undefined,
        avatar ?? undefined,
        resume ?? undefined,
        age ?? undefined,
        picture ?? undefined,
      ];
      while (args.length > 1 && args[args.length - 1] === undefined) args.pop();
      const socket = createSocket(...args);
      socketRef.current = socket;
      const isCurrent = () => socketRef.current === socket;

      return new Promise((resolve) => {
        socket.on("session", (next: Session) => {
          if (!isCurrent()) return;
          // Same guest as before: whoever they were talking to saw them leave and come back.
          restoreDirectSession(next.guestId, resume?.guestId === next.guestId);
          // Each connection gets a new secret; this is the one the next connection has to present.
          resumeRef.current = next.resumeSecret
            ? { guestId: next.guestId, secret: next.resumeSecret }
            : null;
          // The server forgets who was blocked when a connection ends, so a new one is told again.
          for (const guestId of getBlockedGuestIds()) {
            socket.emit("dm:block", { guestId });
          }
          setSession(next);
          if (!ownGuestIdsRef.current.includes(next.guestId)) {
            ownGuestIdsRef.current = [
              ...ownGuestIdsRef.current,
              next.guestId,
            ].slice(-MAX_GUEST_IDS);
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
              presenceRoomRef.current = presence.roomSlug;

              applyDirectPresence(presence.members, silent);
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

        socket.on("crowd:state", (next: CrowdState) => {
          if (isCurrent()) setCrowd(next);
        });

        socket.on("admin:rooms", (next: { rooms: Room[] }) => {
          if (!isCurrent()) return;
          setSession((previous) => {
            if (!previous?.admin) return previous;
            return { ...previous, adminRooms: next.rooms };
          });
        });

        socket.on(
          "admin:count",
          (next: { roomSlug: string; count: number }) => {
            if (isCurrent()) {
              setAdminCounts((previous) => ({
                ...previous,
                [next.roomSlug]: next.count,
              }));
            }
          },
        );

        socket.on("announcement:new", (value: unknown) => {
          const next = parseAnnouncement(value);

          if (!isCurrent() || !next) return;
          const currentRoom = roomRef.current;
          if (currentRoom) {
            setAnnouncements((previous) =>
              previous.some((known) => known.id === next.id)
                ? previous
                : [...previous, { ...next, roomSlug: currentRoom }].slice(
                    -MAX_MESSAGES,
                  ),
            );
          }

          if (next.id !== dismissedAnnouncementRef.current) {
            setAnnouncement(next);
          }
        });

        socket.on("dm:new", (value: unknown) => {
          if (isCurrent()) receiveDirect(value);
        });

        socket.on("room:event", (value: unknown) => {
          const event = parseRoomEvent(value);
          if (!isCurrent() || !event || event.roomSlug !== roomRef.current) {
            return;
          }

          addRoomEvents([{ ...event, seq: ++arrivalRef.current }]);
        });

        socket.on("idle:warning", (value: unknown) => {
          const remaining = isRecord(value) ? Number(value.remainingMs) : NaN;
          if (!isCurrent() || !(remaining > 0)) return;

          setIdleDeadline(Date.now() + remaining);
        });

        // The guest did something, so the disconnect is a full wait away again.
        socket.on("idle:cleared", () => {
          if (isCurrent()) setIdleDeadline(null);
        });

        socket.on("dm:reaction", (value: unknown) => {
          if (isCurrent()) receiveDirectReaction(value);
        });

        socket.on("dm:blocked", (value: unknown) => {
          if (isCurrent()) receiveDirectBlock(value, true);
        });

        socket.on("dm:unblocked", (value: unknown) => {
          if (isCurrent()) receiveDirectBlock(value, false);
        });

        socket.on("message:redacted", (notice: unknown) => {
          if (!isCurrent()) return;
          redactDirectMessages(notice);
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

        // Enough people reported a message, so the server hid it for everybody.
        socket.on("message:hidden", (notice: unknown) => {
          if (!isCurrent()) return;
          setMessages((previous) =>
            applyHidden(previous, notice, roomRef.current),
          );
        });

        // In a busy room reactions come many times a second, and each would draw the room again. The first is applied at once,
        // and those that follow within a moment are applied together when it is over.
        const pendingReactions = new Map<string, Reaction[]>();
        let reactionWindow: ReturnType<typeof setTimeout> | undefined;
        const flushReactions = () => {
          if (!isCurrent() || pendingReactions.size === 0) return;

          const batch = new Map(pendingReactions);
          pendingReactions.clear();
          setMessages((previous) =>
            previous.map((message) => {
              const reactions = batch.get(message.id);

              return reactions && !message.banned
                ? {
                    ...message,
                    reactions: reactions.length ? reactions : undefined,
                  }
                : message;
            }),
          );
        };
        const queueReaction = (messageId: string, reactions: Reaction[]) => {
          pendingReactions.set(messageId, reactions);
          if (reactionWindow !== undefined) return;

          flushReactions();
          reactionWindow = setTimeout(() => {
            reactionWindow = undefined;
            flushReactions();
          }, REACTION_BATCH_MS);
        };

        socket.on("reaction:update", (update: unknown) => {
          if (!isCurrent() || !isRecord(update)) return;
          const { messageId } = update;
          if (
            typeof messageId !== "string" ||
            update.roomSlug !== roomRef.current
          ) {
            return;
          }

          queueReaction(messageId, parseReactions(update.reactions));
        });

        socket.on("kicked", (payload: { reason: string }) => {
          if (!isCurrent()) return;
          setIdleDeadline(null);
          setError(payload.reason);
        });

        socket.on("disconnect", (reason: string) => {
          if (!isCurrent()) return;
          setIdleDeadline(null);
          socketRef.current = null;
          onDrop(reason);
        });
      });
    },
    [
      addRoomEvents,
      applyDirectPresence,
      closeSocket,
      createSocket,
      getBlockedGuestIds,
      getConnectionProfile,
      receiveDirect,
      receiveDirectBlock,
      receiveDirectReaction,
      redactDirectMessages,
      restoreDirectSession,
    ],
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
            addRoomEvents(eventsFromHistory(ack.history, slug));
          }
          return;
        }

        if (PERMANENT_ERRORS.has(failure)) return giveUp(failure);
      }

      giveUp("connection_lost");
    },
    [
      addRoomEvents,
      cancelReconnect,
      emitWithAck,
      openSocket,
      resetConnection,
      resetRoom,
    ],
  );

  const handleDrop = useCallback(
    function handleDrop(reason: string) {
      const { nickname } = getConnectionProfile();

      // Nothing to recover when the guest was only browsing the lobby.
      if (!DELIBERATE_DISCONNECTS.has(reason) && roomRef.current && nickname) {
        void reconnect(nickname, handleDrop);
        return;
      }

      resetConnection();
    },
    [getConnectionProfile, reconnect, resetConnection],
  );

  const connect = useCallback(
    async (
      nickname: string,
      options: ConnectOptions = {},
    ): Promise<boolean> => {
      const { token, previousGuestIds = [], resume } = options;

      cancelReconnect();
      closeSocket();
      setError(null);
      resumeRef.current = resume ?? null;
      ownGuestIdsRef.current = previousGuestIds;
      setOwnGuestIds(previousGuestIds);
      restoreDirect(options);
      setStatus("connecting");
      rememberConnectionProfile(nickname, options);
      tokenRef.current = token ?? null;

      const failure = await openSocket(nickname, handleDrop);

      if (failure) {
        setStatus("idle");
        setError(failure);
        return false;
      }

      setStatus("connected");
      return true;
    },
    [
      cancelReconnect,
      closeSocket,
      handleDrop,
      openSocket,
      rememberConnectionProfile,
      restoreDirect,
    ],
  );

  const joinRoom = useCallback(
    async (slug: string): Promise<ActionResult> => {
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
        rejectDirectRestore();
        return { ok: false, error: ack.error };
      }

      setRoomEvents((existing) =>
        existing.filter((event) => event.roomSlug === slug),
      );
      setAnnouncements((existing) =>
        existing.filter((announcement) => announcement.roomSlug === slug),
      );
      addRoomEvents(eventsFromHistory(ack.history, slug));
      setMessages((existing) =>
        mergeHistory(
          existing.filter((message) => message.roomSlug === slug),
          ack.history,
          slug,
        ),
      );
      setRoomSlug(slug);
      return { ok: true };
    },
    [addRoomEvents, emitWithAck, rejectDirectRestore],
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
      const ack = await emitWithAck("message:send", { text });

      settle(ack);
      return ack.ok;
    },
    [emitWithAck, settle],
  );

  // Adds the guest's reaction to a message, or takes it back; the room is told what the reactions are now.
  const react = useCallback(
    async (messageId: string, emoji: string): Promise<void> => {
      settle(await emitWithAck("reaction:toggle", { messageId, emoji }));
    },
    [emitWithAck, settle],
  );

  const sendAnnouncement = useCallback(
    async (text: string): Promise<AnnounceResult> =>
      toResult(await emitWithAck("announce:send", { text })),
    [emitWithAck],
  );

  // Reports a message in the room. It is hidden for the guest at once; the server hides it for everybody once enough
  // different people have reported it.
  const reportMessage = useCallback(
    async (messageId: string, reason: ReportReason): Promise<ActionResult> => {
      const result = toResult(
        await emitWithAck("message:report", { messageId, reason }),
      );

      if (result.ok) {
        setMessages((previous) =>
          hideMessage(previous, messageId, roomRef.current),
        );
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

  // One of the admin's testing tools (see the chat-server's adminRooms.ts).
  const adminTool = useCallback(
    async (event: string, payload?: unknown): Promise<ActionResult> => {
      const ack = await emitWithAck(event, payload);
      settle(ack);
      return toResult(ack);
    },
    [emitWithAck, settle],
  );

  useEffect(
    () => () => {
      cancelReconnect();
      closeSocket();
    },
    [cancelReconnect, closeSocket],
  );

  // The same array until something changes, so that what depends on it is not run by every render.
  const roomEventsHere = useMemo(
    () => roomEvents.filter((event) => event.roomSlug === roomSlug),
    [roomEvents, roomSlug],
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
    roomEvents: roomEventsHere,
    error,
    retryAfterSeconds,
    announcement,
    announcements,
    idleDeadline,
    direct,
    connect,
    joinRoom,
    leaveRoom,
    sendMessage,
    react,
    reportMessage,
    sendAnnouncement,
    updateProfile,
    claimAccount: async (input: PasswordClaim) => {
      const ack = await emitWithAck("account:claim", input);
      if (!ack.ok)
        throw new AccountError(
          ack.error === "rate_limited" ? "too_many_attempts" : ack.error,
        );
      return parseAccountSession(ack.account);
    },
    dismissAnnouncement,
    disconnect,
    clearError,
    adminTool,
    crowd,
    adminCounts,
  };
}

export type DirectApi = ReturnType<typeof useChat>["direct"];
