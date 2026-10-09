import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  ActionResult,
  AnnounceResult,
  ChatMessage,
  DirectApi,
  Member,
  Session,
} from "../chat/useChat";
import { AnnounceForm } from "./AnnounceForm";
import { PLAIN_AVATAR } from "../chat/avatar";
import type { Partner } from "../chat/direct";
import { timeline, withDirect, type RoomEvent } from "../chat/roomEvents";
import { loadShowMovements, saveShowMovements } from "../preferences";
import { DirectChat } from "./DirectChat";
import { PeopleList, ThreadList } from "./DirectLists";
import { ErrorAlert } from "./ErrorAlert";
import { DirectRow, MessageRow, StatusRow } from "./MessageRow";

interface ChatRoomProps {
  roomName: string;
  session: Session;
  ownGuestIds: string[];
  connected: boolean;
  members: Member[];
  messages: ChatMessage[];
  events: RoomEvent[];
  error: string | null;
  retryAfterSeconds: number | null;
  slowModeSeconds?: number | null;
  onSend: (text: string) => Promise<boolean>;
  onAnnounce: (text: string) => Promise<AnnounceResult>;
  direct: DirectApi;
  onLeave: () => void;
}

export function ChatRoom({
  roomName,
  session,
  ownGuestIds,
  connected,
  members,
  messages,
  events,
  error,
  retryAfterSeconds,
  slowModeSeconds,
  onSend,
  onAnnounce,
  direct,
  onLeave,
}: ChatRoomProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const logRef = useRef<HTMLOListElement>(null);
  const [showMovements, setShowMovements] = useState(loadShowMovements);
  const items = withDirect(
    timeline(messages, showMovements ? events : []),
    direct.threads,
  );
  // Who the room's input writes to privately, when a private message was clicked.
  const [replyTo, setReplyTo] = useState<Partner | null>(null);
  const [replyFailure, setReplyFailure] = useState<
    ActionResult & { ok: false }
  >();
  const replyPresent =
    !replyTo || members.some((member) => member.guestId === replyTo.guestId);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, events, showMovements, direct.threads]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    if (replyTo) {
      const result = await direct.send(replyTo.guestId, trimmed);

      if (result.ok) {
        setText("");
        setReplyFailure(undefined);
      } else {
        setReplyFailure(result);
      }

      return;
    }

    if (await onSend(trimmed)) setText("");
  }

  function startReply(partner: Partner | null) {
    setReplyTo(partner);
    setReplyFailure(undefined);
  }

  // Everybody else in the room, plus the chosen person if they have left, so the choice does not silently change.
  const recipients: Partner[] = [
    ...members
      .filter((member) => member.guestId !== session.guestId)
      .map((member) => ({
        guestId: member.guestId,
        nickname: member.nickname,
        role: member.role ?? "guest",
        avatar: member.avatar ?? PLAIN_AVATAR,
      })),
    ...(replyTo && !replyPresent ? [replyTo] : []),
  ];

  function chooseRecipient(guestId: string) {
    startReply(recipients.find((person) => person.guestId === guestId) ?? null);
  }

  const replyWaiting =
    replyFailure?.error === "rate_limited" && replyFailure.retryAfterSeconds;

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

        {direct.active ? (
          <DirectChat
            key={direct.active.guestId}
            partner={direct.active}
            ownGuestIds={ownGuestIds}
            ownNickname={session.nickname}
            present={members.some(
              (member) => member.guestId === direct.active?.guestId,
            )}
            blocked={direct.blockedIds.includes(direct.active.guestId)}
            onSend={(text) => direct.send(direct.active!.guestId, text)}
            onSetBlocked={(blocked) =>
              direct.setBlocked(direct.active!.guestId, blocked)
            }
            onBack={direct.close}
          />
        ) : (
          <>
            <ol
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label={roomName}
              className="flex h-96 flex-col gap-2 overflow-y-auto rounded-lg [&>*]:shrink-0 [&>:first-child]:mt-auto border border-slate-800 bg-slate-900 p-3"
            >
              {items.length === 0 && (
                <li className="text-slate-500">{t("room.empty")}</li>
              )}
              {items.map((item) =>
                item.kind === "event" ? (
                  <StatusRow
                    key={item.event.id}
                    text={t(`room.${item.event.event}`, {
                      name: item.event.nickname,
                    })}
                    sentAt={item.event.sentAt}
                  />
                ) : item.kind === "direct" ? (
                  <DirectRow
                    key={item.message.id}
                    mine={ownGuestIds.includes(item.message.fromGuestId)}
                    partner={item.partner}
                    sentAt={item.message.sentAt}
                    text={item.message.text}
                    banned={item.message.banned}
                    onReply={() => startReply(item.partner)}
                  />
                ) : item.message.banned ? (
                  <li key={item.message.id}>
                    <span className="font-semibold italic text-red-400">
                      {t("room.bannedMessage")}
                    </span>
                    <time
                      dateTime={item.message.sentAt}
                      className="ml-2 text-xs text-slate-500"
                    >
                      {new Date(item.message.sentAt).toLocaleTimeString()}
                    </time>
                  </li>
                ) : (
                  <MessageRow
                    key={item.message.id}
                    mine={ownGuestIds.includes(item.message.guestId)}
                    nickname={item.message.nickname}
                    role={item.message.role ?? "guest"}
                    avatar={item.message.avatar ?? PLAIN_AVATAR}
                    sentAt={item.message.sentAt}
                    text={item.message.text}
                  />
                ),
              )}
            </ol>

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={showMovements}
                onChange={(event) => {
                  setShowMovements(event.target.checked);
                  saveShowMovements(event.target.checked);
                }}
              />
              {t("room.showMovements")}
            </label>

            <ErrorAlert
              code={
                replyFailure
                  ? replyWaiting
                    ? "rate_limited_wait"
                    : replyFailure.error
                  : error === "rate_limited" && retryAfterSeconds
                    ? "rate_limited_wait"
                    : error
              }
              values={{
                seconds: replyFailure
                  ? replyFailure.retryAfterSeconds
                  : retryAfterSeconds,
              }}
            />
          </>
        )}

        {!connected && (
          <p
            role="status"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          >
            {t("room.reconnecting")}
          </p>
        )}

        {!direct.active && (
          <>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <label htmlFor="recipient" className="sr-only">
                {t("dm.recipient")}
              </label>
              <select
                id="recipient"
                value={replyTo?.guestId ?? ""}
                onChange={(event) => chooseRecipient(event.target.value)}
                className="max-w-[9rem] rounded-md border border-slate-700 bg-slate-950 px-2 py-2"
              >
                <option value="">{t("dm.all")}</option>
                {recipients.map((person) => (
                  <option key={person.guestId} value={person.guestId}>
                    {person.nickname}
                  </option>
                ))}
              </select>
              <label htmlFor="message" className="sr-only">
                {replyTo
                  ? t("dm.label", { name: replyTo.nickname })
                  : t("room.messageLabel")}
              </label>
              <input
                id="message"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={1000}
                autoComplete="off"
                disabled={!connected || !replyPresent}
                placeholder={
                  replyTo
                    ? t("dm.replyPlaceholder", { name: replyTo.nickname })
                    : t("room.messagePlaceholder")
                }
                className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!connected || !replyPresent}
                className="rounded-md bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-60"
              >
                {t("room.send")}
              </button>
            </form>

            {replyTo && !replyPresent && (
              <p role="status" className="text-sm text-amber-300">
                {t("dm.away", { name: replyTo.nickname })}
              </p>
            )}

            {session.role === "moderator" && (
              <AnnounceForm disabled={!connected} onAnnounce={onAnnounce} />
            )}
          </>
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
        <PeopleList
          members={members}
          selfGuestId={session.guestId}
          onOpen={direct.open}
        />

        <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-300">
          {t("dm.heading")}
        </h3>
        <ThreadList threads={direct.threads} onOpen={direct.open} />
      </aside>
    </section>
  );
}
