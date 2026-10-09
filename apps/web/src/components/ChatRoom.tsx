import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeft, SendHorizontal } from "lucide-react";
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
import { focusMessageBox } from "../focusMessageBox";
import { NAV_STOP_CLASS, navStop, useRowNavigation } from "../rowNavigation";
import { DirectChat } from "./DirectChat";
import { ErrorAlert } from "./ErrorAlert";
import { DirectRow, MessageRow, StatusRow } from "./MessageRow";
import { MessageInput } from "./MessageInput";
import { PersonMenu } from "./PersonMenu";
import { RecipientPicker } from "./RecipientPicker";
import { RoomPanel } from "./RoomPanel";

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
  onSend: (text: string) => Promise<boolean>;
  onAnnounce: (text: string) => Promise<AnnounceResult>;
  direct: DirectApi;
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
  onSend,
  onAnnounce,
  direct,
}: ChatRoomProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
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

  // Every message is a stop for the arrow keys, the only way to move through a long chat without a mouse; the notices
  // between them have nothing to read or do.
  const navIds = items.flatMap((item) =>
    item.kind === "event" ? [] : [item.message.id],
  );
  const rows = useRowNavigation(navIds);

  // Whether the page is at its end, so that something new only scrolls it when the guest is not reading further up.
  const atBottom = useRef(true);
  useEffect(() => {
    const page = document.documentElement;
    const update = () => {
      atBottom.current =
        page.scrollHeight - page.scrollTop - page.clientHeight < 120;
    };

    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const scrollToEnd = () => {
    const page = document.documentElement;
    page.scrollTop = page.scrollHeight;
  };

  // The sticky message bar covers the page's end, so scrolling the last item into view would stop short of it.
  const openGuestId = direct.active?.guestId ?? null;
  useLayoutEffect(() => {
    if (atBottom.current) scrollToEnd();
  }, [messages, events, showMovements, direct.threads]);

  // Opening or closing a conversation shows a different page, which starts at its end.
  useLayoutEffect(() => {
    atBottom.current = true;
    scrollToEnd();
  }, [openGuestId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    // What the guest has just written is what they want to see.
    atBottom.current = true;

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

  function chooseRecipient(guestId: string | null) {
    startReply(recipients.find((person) => person.guestId === guestId) ?? null);
    focusMessageBox();
  }

  function openConversation(partner: Partner) {
    direct.open(partner);
    focusMessageBox();
  }

  const personMenu = (partner: Partner, id: string, mine = false) => {
    const blocked = direct.blockedIds.includes(partner.guestId);

    return (
      <PersonMenu
        partner={partner}
        navId={id}
        tabStop={id === rows.stopId}
        side={mine ? "left" : "right"}
        present={members.some((member) => member.guestId === partner.guestId)}
        blocked={blocked}
        onMessage={() => {
          startReply(partner);
          focusMessageBox();
        }}
        onOpenChat={() => openConversation(partner)}
        onToggleBlock={() =>
          void direct.setBlocked(partner.guestId, !blocked).then((result) => {
            if (!result.ok) setReplyFailure(result);
          })
        }
      />
    );
  };

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
          <p className="text-sm text-slate-400">
            {t("room.chattingAs", { nickname: session.nickname })}
          </p>

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
              onFocus={rows.onFocus}
              onBlur={rows.onBlur}
              onKeyDownCapture={rows.onKeyDownCapture}
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
                    menu={personMenu(
                      item.partner,
                      item.message.id,
                      ownGuestIds.includes(item.message.fromGuestId),
                    )}
                  />
                ) : item.message.banned ? (
                  <li
                    key={item.message.id}
                    {...navStop(
                      item.message.id,
                      item.message.id === rows.stopId,
                    )}
                    className={`-mx-2 rounded-lg px-2 py-1 ${NAV_STOP_CLASS}`}
                  >
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
                    stop={{
                      id: item.message.id,
                      tabStop: item.message.id === rows.stopId,
                    }}
                    menu={
                      ownGuestIds.includes(item.message.guestId)
                        ? undefined
                        : personMenu(
                            {
                              guestId: item.message.guestId,
                              nickname: item.message.nickname,
                              role: item.message.role ?? "guest",
                              avatar: item.message.avatar ?? PLAIN_AVATAR,
                            },
                            item.message.id,
                          )
                    }
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

              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <RecipientPicker
                  recipients={recipients}
                  value={replyTo}
                  onChange={chooseRecipient}
                  threads={direct.threads}
                  onOpenThread={openConversation}
                  showMovements={showMovements}
                  notify={direct.notify}
                  onNotifyChange={direct.setNotify}
                  onSetMuted={direct.setMuted}
                  onShowMovementsChange={changeShowMovements}
                />
                <label htmlFor="message" className="sr-only">
                  {replyTo
                    ? t("dm.label", { name: replyTo.nickname })
                    : t("room.messageLabel")}
                </label>
                <MessageInput
                  id="message"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
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
          onOpen={openConversation}
          showMovements={showMovements}
          onShowMovementsChange={changeShowMovements}
          notify={direct.notify}
          onNotifyChange={direct.setNotify}
          onSetMuted={direct.setMuted}
        />
      </aside>
    </section>
  );
}
