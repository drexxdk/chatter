import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addDirectMessage,
  applyPresence,
  markReturned,
  markRead,
  parseDirectMessage,
  parsePartner,
  redactDirect,
  refreshPartners,
  setBlockedBy,
  dropBlockedByNotices,
  type DirectThread,
  type Partner,
} from "./direct";
import { movements, type RoomEvent } from "./roomEvents";
import { loadNotifyDirect, saveNotifyDirect } from "../preferences";
import { parseAge, type ProfileChanges } from "../profile";
import { parseAvatar, PLAIN_AVATAR, type Avatar } from "./avatar";
import {
  applyRedaction,
  isRecord,
  MAX_MESSAGES,
  mergeHistory,
  parseAnnouncement,
  strings,
} from "./messages";
import { parseReactions } from "./reactions";
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
  type Member,
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
  const ageRef = useRef<number | null>(null);
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
      const age = ageRef.current;
      const resume = resumeRef.current;
      // Trailing arguments that are not needed are left off, so a plain guest's call is just the nickname.
      const args: [string, string?, Avatar?, Resume?, number?] = [
        nickname,
        token ?? undefined,
        avatar ?? undefined,
        resume ?? undefined,
        age ?? undefined,
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
                  (event) =>
                    !bannedGuestIdsRef.current.has(event.guestId) &&
                    !blockedRef.current.includes(event.guestId),
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
                refreshPartners(
                  applyPresence(
                    previous,
                    new Set(presence.members.map((member) => member.guestId)),
                    new Date().toISOString(),
                    silent,
                    () => crypto.randomUUID(),
                    blockedRef.current,
                  ),
                  presence.members,
                ),
              );

              const open = partnerRef.current;
              const now = open
                ? presence.members.find(
                    (member) => member.guestId === open.guestId,
                  )
                : undefined;

              if (
                open &&
                now &&
                (now.nickname !== open.nickname ||
                  (now.avatar ?? PLAIN_AVATAR) !== open.avatar)
              ) {
                partnerRef.current = {
                  ...open,
                  nickname: now.nickname,
                  avatar: now.avatar ?? PLAIN_AVATAR,
                };
                setPartner(partnerRef.current);
              }
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

        socket.on("dm:blocked", (value: unknown) => {
          const blocker = parsePartner(value);
          if (!isCurrent() || !blocker) return;

          setThreads((previous) =>
            setBlockedBy(
              previous,
              blocker,
              true,
              new Date().toISOString(),
              () => crypto.randomUUID(),
              blockedRef.current.includes(blocker.guestId),
            ),
          );
        });

        socket.on("dm:unblocked", (value: unknown) => {
          const blocker = parsePartner(value);
          if (!isCurrent() || !blocker) return;

          setThreads((previous) =>
            setBlockedBy(
              previous,
              blocker,
              false,
              new Date().toISOString(),
              () => crypto.randomUUID(),
              blockedRef.current.includes(blocker.guestId),
            ),
          );
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

        socket.on("reaction:update", (update: unknown) => {
          if (!isCurrent() || !isRecord(update)) return;
          const { messageId } = update;
          if (
            typeof messageId !== "string" ||
            update.roomSlug !== roomRef.current
          ) {
            return;
          }

          const reactions = parseReactions(update.reactions);
          setMessages((previous) =>
            previous.map((message) =>
              message.id === messageId && !message.banned
                ? {
                    ...message,
                    reactions: reactions.length ? reactions : undefined,
                  }
                : message,
            ),
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
      const { token, avatar, age, previousGuestIds = [], resume } = options;

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
      ageRef.current = age ?? null;

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
        if (restoredPartnerRef.current) {
          restoredPartnerRef.current = null;
          partnerRef.current = null;
          setPartner(null);
        }
        return { ok: false, error: ack.error };
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
      return { ok: true };
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

  // Adds the guest's reaction to a message, or takes it back; the room is told what the reactions are now.
  const react = useCallback(
    async (messageId: string, emoji: string): Promise<void> => {
      setError(null);
      setRetryAfterSeconds(null);
      const ack = await emitWithAck("reaction:toggle", { messageId, emoji });

      if (!ack.ok) {
        setError(ack.error);
        if (ack.retryAfterMs) {
          setRetryAfterSeconds(Math.ceil(ack.retryAfterMs / 1000));
        }
      }
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
    async (toGuestId: string, text: string): Promise<ActionResult> => {
      const result = toResult(
        await emitWithAck("dm:send", { toGuestId, text }),
      );

      // The server says so when the other person has blocked the guest, whether or not it was told earlier.
      if (!result.ok && result.error === "blocked_by_recipient") {
        const member = membersRef.current.find(
          (candidate) => candidate.guestId === toGuestId,
        );

        setThreads((previous) => {
          const thread = previous.find(
            (candidate) => candidate.guestId === toGuestId,
          );
          const partner: Partner | undefined = thread
            ? {
                guestId: toGuestId,
                nickname: thread.nickname,
                role: thread.role,
                avatar: thread.avatar,
              }
            : member
              ? {
                  guestId: toGuestId,
                  nickname: member.nickname,
                  role: member.role ?? "guest",
                  avatar: member.avatar ?? PLAIN_AVATAR,
                }
              : undefined;

          return partner
            ? setBlockedBy(
                previous,
                partner,
                true,
                new Date().toISOString(),
                () => crypto.randomUUID(),
              )
            : previous;
        });
      }

      return result;
    },
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
        if (blocked) {
          setThreads((previous) =>
            dropBlockedByNotices(markRead(previous, guestId), guestId),
          );
        }
      }

      return result;
    },
    [emitWithAck],
  );

  // The server answers with who the guest is now (it trims the name); a dropped connection is restored as that guest.
  const updateProfile = useCallback(
    async (changes: ProfileChanges): Promise<ActionResult> => {
      const ack = await emitWithAck("profile:update", changes);

      if (!ack.ok) return toResult(ack);

      const profile = isRecord(ack.profile) ? ack.profile : {};
      const nickname =
        typeof profile.nickname === "string" && profile.nickname
          ? profile.nickname
          : (nicknameRef.current ?? "");
      const avatar = parseAvatar(profile.avatar);
      const age = parseAge(profile.age);

      nicknameRef.current = nickname;
      avatarRef.current = avatar === PLAIN_AVATAR ? null : avatar;
      ageRef.current = age ?? null;
      setSession((current) =>
        current ? { ...current, nickname, avatar, age } : current,
      );

      return { ok: true };
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
    // Who has blocked the guest: nothing written to them gets through. Not told about those the guest blocked too.
    blockedByIds: threads
      .filter(
        (thread) => thread.blockedBy && !blockedIds.includes(thread.guestId),
      )
      .map((thread) => thread.guestId),
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
    direct,
    connect,
    joinRoom,
    leaveRoom,
    sendMessage,
    react,
    sendAnnouncement,
    updateProfile,
    dismissAnnouncement,
    disconnect,
    clearError,
  };
}

export type DirectApi = ReturnType<typeof useChat>["direct"];
