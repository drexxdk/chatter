import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ChatMessage, Member, Session } from "../chat/useChat";
import { ErrorAlert } from "./ErrorAlert";

interface ChatRoomProps {
  roomName: string;
  session: Session;
  members: Member[];
  messages: ChatMessage[];
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onLeave: () => void;
}

export function ChatRoom({ roomName, session, members, messages, error, onSend, onLeave }: ChatRoomProps) {
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
    <section aria-labelledby="room-heading" className="grid gap-4 md:grid-cols-[1fr_14rem]">
      <div className="space-y-3 md:col-start-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="room-heading" className="text-xl font-semibold">
              {roomName}
            </h2>
            <p className="text-sm text-slate-400">{t("room.chattingAs", { nickname: session.nickname })}</p>
          </div>
          <button type="button" onClick={onLeave} className="rounded-md bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
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
          {messages.length === 0 && <li className="text-slate-500">{t("room.empty")}</li>}
          {messages.map((message) => (
            <li key={message.id}>
              <span className={message.guestId === session.guestId ? "font-semibold text-indigo-300" : "font-semibold"}>
                {message.nickname}
              </span>
              <time dateTime={message.sentAt} className="ml-2 text-xs text-slate-500">
                {new Date(message.sentAt).toLocaleTimeString()}
              </time>
              {/* Rendered as text, never as HTML. */}
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
            </li>
          ))}
        </ol>

        <ErrorAlert code={error} />

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
            placeholder={t("room.messagePlaceholder")}
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500">
            {t("room.send")}
          </button>
        </form>
      </div>

      <aside aria-labelledby="members-heading" className="md:col-start-2 md:row-start-1">
        <h3 id="members-heading" className="mb-2 text-sm font-semibold text-slate-300">
          {t("room.members", { count: members.length })}
        </h3>
        <ul className="space-y-1 text-sm">
          {members.map((member) => (
            <li key={member.guestId}>
              {member.nickname}
              {member.guestId === session.guestId && <span className="ml-1 text-slate-500">({t("room.you")})</span>}
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
