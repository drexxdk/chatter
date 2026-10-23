import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  TYPING_EVENT,
  TYPING_INTERVAL_MS,
  TYPING_TTL_MS,
  type TypingNotice,
} from "../../../../shared/chatProtocol.mjs";
import { isRecord } from "../isRecord";
import type { ChatSocket } from "./socket";

const STOP_GRACE_MS = 1000;

export function useTyping({
  socketRef,
  roomRef,
  ownGuestIdsRef,
  getBlockedGuestIds,
}: {
  socketRef: RefObject<ChatSocket | null>;
  roomRef: RefObject<string | null>;
  ownGuestIdsRef: RefObject<string[]>;
  getBlockedGuestIds: () => readonly string[];
}) {
  const [writers, setWriters] = useState<
    (TypingNotice & { expiresAt: number })[]
  >([]);
  const sent = useRef<{ toGuestId?: string; at: number } | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const update = useCallback(
    (active: boolean, toGuestId?: string) => {
      clearTimeout(stopTimer.current);
      const previous = sent.current;
      if (previous && (!active || previous.toGuestId !== toGuestId)) {
        socketRef.current?.emit(TYPING_EVENT, { active: false });
        sent.current = null;
      }
      if (!active || !socketRef.current) return;
      const now = Date.now();
      if (!sent.current || now - sent.current.at >= TYPING_INTERVAL_MS) {
        socketRef.current.emit(TYPING_EVENT, {
          active: true,
          ...(toGuestId ? { toGuestId } : {}),
        });
        sent.current = { toGuestId, at: now };
      }
      stopTimer.current = setTimeout(() => {
        socketRef.current?.emit(TYPING_EVENT, { active: false });
        sent.current = null;
      }, TYPING_TTL_MS - 500);
    },
    [socketRef],
  );

  const reset = useCallback(() => {
    clearTimeout(stopTimer.current);
    sent.current = null;
    setWriters([]);
  }, []);

  const receive = useCallback(
    (value: unknown) => {
      if (
        !isRecord(value) ||
        typeof value.guestId !== "string" ||
        !value.guestId ||
        value.guestId.length > 64 ||
        typeof value.nickname !== "string" ||
        !value.nickname ||
        value.nickname.length > 24 ||
        typeof value.active !== "boolean" ||
        ownGuestIdsRef.current.includes(value.guestId) ||
        getBlockedGuestIds().includes(value.guestId)
      )
        return;
      if (value.toGuestId !== undefined) {
        if (
          typeof value.toGuestId !== "string" ||
          !ownGuestIdsRef.current.includes(value.toGuestId) ||
          value.roomSlug !== undefined
        )
          return;
      } else if (
        typeof value.roomSlug !== "string" ||
        value.roomSlug !== roomRef.current
      )
        return;
      const notice = value as unknown as TypingNotice;
      setWriters((previous) => {
        const now = Date.now();
        const remaining = previous.filter((writer) => writer.expiresAt > now);
        const index = remaining.findIndex(
          (writer) => writer.guestId === notice.guestId,
        );
        if (notice.active) {
          const refreshed = { ...notice, expiresAt: now + TYPING_TTL_MS };
          return index < 0
            ? [...remaining, refreshed].slice(-200)
            : remaining.map((writer, position) =>
                position === index ? refreshed : writer,
              );
        }
        return remaining.map((writer) =>
          writer.guestId === notice.guestId &&
          writer.toGuestId === notice.toGuestId &&
          writer.roomSlug === notice.roomSlug
            ? {
                ...writer,
                expiresAt: Math.min(writer.expiresAt, now + STOP_GRACE_MS),
              }
            : writer,
        );
      });
    },
    [getBlockedGuestIds, ownGuestIdsRef, roomRef],
  );

  useEffect(() => {
    if (!writers.length) return;
    const expiresAt = Math.min(...writers.map((writer) => writer.expiresAt));
    const timer = setTimeout(
      () => {
        setWriters((previous) =>
          previous.filter((writer) => writer.expiresAt > Date.now()),
        );
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [writers]);

  useEffect(() => () => clearTimeout(stopTimer.current), []);

  return { writers, update, receive, reset };
}

export type TypingApi = ReturnType<typeof useTyping>;
