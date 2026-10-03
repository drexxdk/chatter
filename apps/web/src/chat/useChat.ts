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
}

export type ChatStatus = "idle" | "connecting" | "connected" | "reconnecting";

type Ack = { ok: true } | { ok: false; error: string };
type DropHandler = (reason: string) => void;

const MAX_MESSAGES = 200;
const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
// Errors the server reports in connect_error; anything else (network failure, CORS) is a connection problem.
const HANDSHAKE_ERRORS = new Set(["invalid_nickname", "banned", "unavailable"]);
// Rejections that retrying cannot fix.
const PERMANENT_ERRORS = new Set(["invalid_nickname", "banned"]);
// Disconnects somebody chose (this client, or the server kicking the guest); everything else is a dropped connection.
const DELIBERATE_DISCONNECTS = new Set([
  "io client disconnect",
  "io server disconnect",
]);

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
            setMessages((previous) =>
              [...previous, message].slice(-MAX_MESSAGES),
            );
          }
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
        existing.filter((message) => message.roomSlug === slug),
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
      const ack = await emitWithAck("message:send", { text });

      if (!ack.ok) setError(ack.error);
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
    connect,
    joinRoom,
    leaveRoom,
    sendMessage,
    disconnect,
    clearError,
  };
}
