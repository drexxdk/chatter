import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSocket as defaultCreateSocket,
  type ChatSocket,
  type CreateSocket,
} from "./socket";

export interface Session {
  guestId: string;
  nickname: string;
}

export interface Member {
  guestId: string;
  nickname: string;
}

export interface ChatMessage {
  id: string;
  roomSlug: string;
  guestId: string;
  nickname: string;
  text: string;
  sentAt: string;
  // The author was banned: the text and name are gone and only a placeholder is shown.
  banned?: boolean;
}

export type ChatStatus = "idle" | "connecting" | "connected" | "reconnecting";

type Ack =
  | { ok: true; history?: unknown }
  | { ok: false; error: string; retryAfterMs?: number };
type DropHandler = (reason: string) => void;

const MAX_MESSAGES = 200;
const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
// Errors the server reports in connect_error; anything else (network failure, CORS) is a connection problem.
const HANDSHAKE_ERRORS = new Set([
  "invalid_nickname",
  "banned",
  "unavailable",
  "too_many_connections",
]);
// Rejections that retrying cannot fix. A full per-network limit is not one: the guest's own dropped connection may
// still be counted for a while.
const PERMANENT_ERRORS = new Set(["invalid_nickname", "banned"]);
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

  return { id, roomSlug, guestId, nickname, text, sentAt };
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
  const [roomSlug, setRoomSlug] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  const resetRoom = useCallback(() => {
    roomRef.current = null;
    setRoomSlug(null);
    setMembers([]);
    setMessages([]);
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
    resetRoom();
  }, [resetRoom]);

  // Resolves with null once the server has accepted the guest, or with the reason it was not.
  const openSocket = useCallback(
    (nickname: string, onDrop: DropHandler): Promise<string | null> => {
      const socket = createSocket(nickname);
      socketRef.current = socket;
      const isCurrent = () => socketRef.current === socket;

      return new Promise((resolve) => {
        socket.on("session", (next: Session) => {
          if (!isCurrent()) return;
          setSession(next);
          setOwnGuestIds((previous) =>
            previous.includes(next.guestId)
              ? previous
              : [...previous, next.guestId],
          );
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
            if (isCurrent() && presence.roomSlug === roomRef.current)
              setMembers(presence.members);
          },
        );

        socket.on("message:new", (message: ChatMessage) => {
          if (isCurrent() && message.roomSlug === roomRef.current) {
            // Already known, e.g. it came with the history or was since replaced by a placeholder.
            setMessages((previous) =>
              previous.some((known) => known.id === message.id)
                ? previous
                : [...previous, message].slice(-MAX_MESSAGES),
            );
          }
        });

        socket.on("message:redacted", (notice: unknown) => {
          if (!isCurrent()) return;
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
        await new Promise((resolve) => setTimeout(resolve, delay));
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
    async (nickname: string): Promise<boolean> => {
      cancelReconnect();
      closeSocket();
      setError(null);
      setOwnGuestIds([]);
      setStatus("connecting");
      nicknameRef.current = nickname;

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
        return false;
      }

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

  const clearError = useCallback(() => setError(null), []);

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
    roomSlug,
    members,
    messages,
    error,
    retryAfterSeconds,
    connect,
    joinRoom,
    leaveRoom,
    sendMessage,
    disconnect,
    clearError,
  };
}
