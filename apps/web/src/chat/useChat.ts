import { useCallback, useEffect, useRef, useState } from "react";

import { createSocket as defaultCreateSocket, type ChatSocket, type CreateSocket } from "./socket";

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

export type ChatStatus = "idle" | "connecting" | "connected";

type Ack = { ok: true } | { ok: false; error: string };

const MAX_MESSAGES = 200;
// Errors the server reports in connect_error; anything else (network failure, CORS) is a connection problem.
const HANDSHAKE_ERRORS = new Set(["invalid_nickname", "banned", "unavailable"]);

export function useChat(createSocket: CreateSocket = defaultCreateSocket) {
  const socketRef = useRef<ChatSocket | null>(null);
  const roomRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ChatStatus>("idle");
  const [session, setSession] = useState<Session | null>(null);
  const [roomSlug, setRoomSlug] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Holds a translation key under `errors.` (a server error code or "connection").
  const [error, setError] = useState<string | null>(null);

  const resetRoom = useCallback(() => {
    roomRef.current = null;
    setRoomSlug(null);
    setMembers([]);
    setMessages([]);
  }, []);

  const connect = useCallback(
    (nickname: string): Promise<boolean> => {
      socketRef.current?.disconnect();
      setError(null);
      setStatus("connecting");

      const socket = createSocket(nickname);
      socketRef.current = socket;
      const isCurrent = () => socketRef.current === socket;

      return new Promise((resolve) => {
        socket.on("session", (next: Session) => {
          if (!isCurrent()) return;
          setSession(next);
          setStatus("connected");
          resolve(true);
        });

        socket.on("connect_error", (cause: Error) => {
          if (!isCurrent()) return;
          socketRef.current = null;
          socket.disconnect();
          setStatus("idle");
          setError(HANDSHAKE_ERRORS.has(cause.message) ? cause.message : "connection");
          resolve(false);
        });

        socket.on("room:presence", (presence: { roomSlug: string; members: Member[] }) => {
          if (isCurrent() && presence.roomSlug === roomRef.current) setMembers(presence.members);
        });

        socket.on("message:new", (message: ChatMessage) => {
          if (isCurrent() && message.roomSlug === roomRef.current) {
            setMessages((previous) => [...previous, message].slice(-MAX_MESSAGES));
          }
        });

        socket.on("kicked", (payload: { reason: string }) => {
          if (isCurrent()) setError(payload.reason);
        });

        socket.on("disconnect", () => {
          if (!isCurrent()) return;
          socketRef.current = null;
          setStatus("idle");
          setSession(null);
          resetRoom();
        });
      });
    },
    [createSocket, resetRoom],
  );

  const emitWithAck = useCallback((event: string, payload?: unknown): Promise<Ack> => {
    const socket = socketRef.current;
    if (!socket) return Promise.resolve({ ok: false, error: "connection" });

    return new Promise((resolve) => socket.emit(event, payload, resolve));
  }, []);

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

      setMessages((existing) => existing.filter((message) => message.roomSlug === slug));
      setRoomSlug(slug);
      return true;
    },
    [emitWithAck],
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    await emitWithAck("room:leave");
    resetRoom();
  }, [emitWithAck, resetRoom]);

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      setError(null);
      const ack = await emitWithAck("message:send", { text });

      if (!ack.ok) setError(ack.error);
      return ack.ok;
    },
    [emitWithAck],
  );

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.disconnect();
    setStatus("idle");
    setSession(null);
    resetRoom();
  }, [resetRoom]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
    },
    [],
  );

  return {
    status,
    session,
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
