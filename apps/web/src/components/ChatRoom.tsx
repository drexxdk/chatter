import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  AnnounceResult,
  ChatMessage,
  Member,
  Session,
} from "../chat/useChat";
import { AnnounceForm } from "./AnnounceForm";
import { ErrorAlert } from "./ErrorAlert";

interface ChatRoomProps {
  roomName: string;
  session: Session;
  ownGuestIds: string[];
  connected: boolean;
  members: Member[];
  messages: ChatMessage[];
  error: string | null;
  retryAfterSeconds: number | null;
  slowModeSeconds?: number | null;
  onSend: (text: string) => Promise<boolean>;
  onAnnounce: (text: string) => Promise<AnnounceResult>;
  onLeave: () => void;
}

export function ChatRoom({
  roomName,
  session,
  ownGuestIds,
  connected,
  members,
  messages,
  error,
  retryAfterSeconds,
  slowModeSeconds,
  onSend,
  onAnnounce,
  onLeave,
}: ChatRoomProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    if (await onSend(trimmed)) setText("");
  }

  return (
    <section
      aria-labelledby="room-heading"
      className="grid gap-4 md:grid-cols-[1fr_14rem]"
    >
      <div className="space-y-3 md:col-start-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="room-heading" className="text-xl font-semibold">
              {roomName}
            </h2>
            <p className="text-sm text-slate-400">
              {t("room.chattingAs", { nickname: session.nickname })}
            </p>
            {slowModeSeconds ? (
              <p className="text-sm text-amber-300">
                {t("room.slowMode", { seconds: slowModeSeconds })}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-md bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
          >
            {t("room.leave")}
          </button>
        </div>

        <ol
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label={roomName}
          className="h-96 space-y-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-3"
        >
          {messages.length === 0 && (
            <li className="text-slate-500">{t("room.empty")}</li>
          )}
          {messages.map((message) =>
            message.banned ? (
              <li key={message.id}>
                <span className="font-semibold italic text-red-400">
                  {t("room.bannedMessage")}
                </span>
                <time
                  dateTime={message.sentAt}
                  className="ml-2 text-xs text-slate-500"
                >
                  {new Date(message.sentAt).toLocaleTimeString()}
                </time>
              </li>
            ) : (
              <li key={message.id}>
                <span
                  className={
                    message.role === "moderator"
                      ? "font-bold text-green-400"
                      : ownGuestIds.includes(message.guestId)
                        ? "font-semibold text-indigo-300"
                        : "font-semibold"
                  }
                >
                  {message.nickname}
                </span>
                {message.role === "moderator" && (
                  <span className="ml-2 rounded bg-green-500/20 px-1.5 py-0.5 text-xs font-semibold uppercase text-green-300">
                    {t("room.moderatorBadge")}
                  </span>
                )}
                <time
                  dateTime={message.sentAt}
                  className="ml-2 text-xs text-slate-500"
                >
                  {new Date(message.sentAt).toLocaleTimeString()}
                </time>
                {/* Rendered as text, never as HTML. */}
                <p
                  className={
                    message.role === "moderator"
                      ? "whitespace-pre-wrap break-words font-bold text-green-300"
                      : "whitespace-pre-wrap break-words"
                  }
                >
                  {message.text}
                </p>
              </li>
            ),
          )}
        </ol>

        <ErrorAlert
          code={
            error === "rate_limited" && retryAfterSeconds
              ? "rate_limited_wait"
              : error
          }
          values={{ seconds: retryAfterSeconds }}
        />

        {!connected && (
          <p
            role="status"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          >
            {t("room.reconnecting")}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="message" className="sr-only">
            {t("room.messageLabel")}
          </label>
          <input
            id="message"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={1000}
            autoComplete="off"
            disabled={!connected}
            placeholder={t("room.messagePlaceholder")}
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!connected}
            className="rounded-md bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-60"
          >
            {t("room.send")}
          </button>
        </form>

        {session.role === "moderator" && (
          <AnnounceForm disabled={!connected} onAnnounce={onAnnounce} />
        )}
      </div>

      <aside
        aria-labelledby="members-heading"
        className="md:col-start-2 md:row-start-1"
      >
        <h3
          id="members-heading"
          className="mb-2 text-sm font-semibold text-slate-300"
        >
          {t("room.members", { count: members.length })}
        </h3>
        <ul className="space-y-1 text-sm">
          {members.map((member) => (
            <li key={member.guestId}>
              <span
                className={
                  member.role === "moderator"
                    ? "font-bold text-green-400"
                    : undefined
                }
              >
                {member.nickname}
              </span>
              {member.role === "moderator" && (
                <span className="ml-1 text-xs text-green-300">
                  ({t("room.moderatorBadge")})
                </span>
              )}
              {member.guestId === session.guestId && (
                <span className="ml-1 text-slate-500">({t("room.you")})</span>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
