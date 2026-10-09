import { useLayoutEffect, useState, type FormEvent } from "react";
import { ArrowLeft, SendHorizontal, Users } from "lucide-react";
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
import { ErrorAlert } from "./ErrorAlert";
import { DirectRow, MessageRow, StatusRow } from "./MessageRow";
import { RoomPanel } from "./RoomPanel";
import { SideDrawer } from "./SideDrawer";

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
  const [panelOpen, setPanelOpen] = useState(false);
  const [showMovements, setShowMovements] = useState(loadShowMovements);
  const unread = direct.threads.reduce((sum, thread) => sum + thread.unread, 0);
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

  // The sticky message bar covers the page's end, so scrolling the last item into view would stop short of it.
  const openGuestId = direct.active?.guestId ?? null;
  useLayoutEffect(() => {
    const page = document.documentElement;
    page.scrollTop = page.scrollHeight;
  }, [messages, events, showMovements, direct.threads, openGuestId]);

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

  function changeShowMovements(show: boolean) {
    setShowMovements(show);
    saveShowMovements(show);
  }

  const replyWaiting =
    replyFailure?.error === "rate_limited" && replyFailure.retryAfterSeconds;

  return (
    <section
      aria-labelledby="room-heading"
      className="grid flex-1 gap-4 md:grid-cols-[1fr_14rem]"
    >
      <div className="flex flex-col md:col-start-1">
        <div className="sticky top-14 z-20 space-y-2 bg-slate-950 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 id="room-heading" className="truncate text-xl font-semibold">
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
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                aria-label={t("room.panel")}
                className="relative rounded-md bg-slate-800 p-2 hover:bg-slate-700 md:hidden"
              >
                <Users aria-hidden="true" className="h-5 w-5" />
                {unread > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-950"
                    >
                      {unread}
                    </span>
                    <span className="sr-only">
                      {t("dm.unread", { count: unread })}
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onLeave}
                className="rounded-md bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
              >
                {t("room.leave")}
              </button>
            </div>
          </div>

          {direct.active && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={direct.close}
                aria-label={t("dm.back")}
                className="rounded-md bg-slate-800 p-1.5 hover:bg-slate-700"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <h3 className="truncate text-lg font-semibold">
                {t("dm.title", { name: direct.active.nickname })}
              </h3>
            </div>
          )}

          {!connected && (
            <p
              role="status"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            >
              {t("room.reconnecting")}
            </p>
          )}
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
          />
        ) : (
          <div className="flex flex-1 flex-col">
            <ol
              role="log"
              aria-live="polite"
              aria-label={roomName}
              className="flex min-h-40 flex-1 flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 [&>*]:shrink-0 [&>:first-child]:mt-auto"
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

            <div className="sticky bottom-0 z-20 space-y-2 bg-slate-950 pb-3 pt-2">
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

              <form onSubmit={handleSubmit} className="flex gap-2">
                <label htmlFor="recipient" className="sr-only">
                  {t("dm.recipient")}
                </label>
                <select
                  id="recipient"
                  value={replyTo?.guestId ?? ""}
                  onChange={(event) => chooseRecipient(event.target.value)}
                  className="w-24 shrink-0 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 sm:w-36"
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
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!connected || !replyPresent}
                  aria-label={t("room.send")}
                  className="rounded-md bg-indigo-600 px-3 py-2 font-medium hover:bg-indigo-500 disabled:opacity-60"
                >
                  <SendHorizontal aria-hidden="true" className="h-5 w-5" />
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
            </div>
          </div>
        )}
      </div>

      <aside
        aria-label={t("room.panel")}
        className="hidden md:col-start-2 md:row-start-1 md:sticky md:top-14 md:block md:max-h-[calc(100dvh-3.5rem)] md:self-start md:overflow-y-auto md:pt-2"
      >
        <RoomPanel
          members={members}
          selfGuestId={session.guestId}
          threads={direct.threads}
          onOpen={direct.open}
          showMovements={showMovements}
          onShowMovementsChange={changeShowMovements}
        />
      </aside>

      <SideDrawer
        open={panelOpen}
        title={t("room.panel")}
        onClose={() => setPanelOpen(false)}
      >
        <RoomPanel
          members={members}
          selfGuestId={session.guestId}
          threads={direct.threads}
          onOpen={(partner) => {
            direct.open(partner);
            setPanelOpen(false);
          }}
          showMovements={showMovements}
          onShowMovementsChange={changeShowMovements}
        />
      </SideDrawer>
    </section>
  );
}
