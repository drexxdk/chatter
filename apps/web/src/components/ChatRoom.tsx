import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeft, Ban, SendHorizontal } from "lucide-react";
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
import { runs } from "../chat/runs";
import { useComposer } from "../chat/useComposer";
import {
  timeline,
  withDirect,
  type RoomEvent,
  type TimelineItem,
} from "../chat/roomEvents";
import { focusMessageBox } from "../focusMessageBox";
import { NAV_STOP_CLASS, navStop, useRowNavigation } from "../rowNavigation";
import { AttachedGif } from "./AttachedGif";
import { DirectChat } from "./DirectChat";
import { BlockedTag } from "./DirectLists";
import { ComposerPicker } from "./ComposerPicker";
import { Timestamp } from "./Timestamp";
import { ErrorAlert } from "./ErrorAlert";
import { MessageGroup, StatusRow } from "./MessageRow";
import { MessageInput } from "./MessageInput";
import { RecipientPicker } from "./RecipientPicker";
import { RoomPanel } from "./RoomPanel";

type MessageItem = Extract<TimelineItem, { kind: "message" }>;
type DirectItem = Extract<TimelineItem, { kind: "direct" }>;

// Who an item in the log is by, so that what somebody wrote in a row is shown together. A private message is by its
// sender to one person, and a message whose author was banned stands alone.
function runAuthor(item: TimelineItem): string | undefined {
  if (item.kind === "message" && !item.message.banned) {
    return `room:${item.message.guestId}`;
  }

  if (item.kind === "direct") {
    return `direct:${item.message.fromGuestId}:${item.partner.guestId}`;
  }

  return undefined;
}
interface ChatRoomProps {
  roomName: string;
  session: Session;
  ownGuestIds: string[];
  connected: boolean;
  members: Member[];
  messages: ChatMessage[];
  events: RoomEvent[];
  // Whether the room's log also tells who came and went.
  showMovements: boolean;
  error: string | null;
  retryAfterSeconds: number | null;
  onSend: (text: string) => Promise<boolean>;
  onReact: (messageId: string, emoji: string) => void;
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
  showMovements,
  error,
  retryAfterSeconds,
  onSend,
  onReact,
  onAnnounce,
  direct,
}: ChatRoomProps) {
  const { t } = useTranslation();
  const composer = useComposer("message");
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
  // Somebody who has been blocked is not written to until they are unblocked.
  const replyBlocked = !!replyTo && direct.blockedIds.includes(replyTo.guestId);
  // Nothing gets through to somebody who has blocked the guest either.
  const replyBlockedBy =
    !!replyTo && direct.blockedByIds.includes(replyTo.guestId);
  const canWrite =
    connected && replyPresent && !replyBlocked && !replyBlockedBy;
  const [blockFailure, setBlockFailure] = useState<
    ActionResult & { ok: false }
  >();

  // Every message is a stop for the arrow keys, the only way to move through a long chat without a mouse; the notices
  // between them have nothing to read or do.
  const navIds = items.flatMap((item) =>
    item.kind === "event" || item.kind === "notice" ? [] : [item.message.id],
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
    setBlockFailure(undefined);
  }, [openGuestId]);

  // Blocking lives in the header of a conversation, out of the way of the scrolling messages.
  async function blockActive() {
    if (!direct.active) return;

    const result = await direct.setBlocked(direct.active.guestId, true);
    setBlockFailure(result.ok ? undefined : result);
    // The button that was used is gone; for the keyboard the cursor goes to the one that undoes it.
    if (result.ok) focusMessageBox();
  }

  async function deliver(value: string): Promise<boolean> {
    // What the guest has just written is what they want to see.
    atBottom.current = true;

    if (replyTo) {
      const result = await direct.send(replyTo.guestId, value);
      setReplyFailure(result.ok ? undefined : result);
      return result.ok;
    }

    return onSend(value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = composer.message;
    if (!value || replyBlocked || replyBlockedBy) return;

    if (await deliver(value)) composer.clear();
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

  // A click on somebody's message chooses them to write to privately, if they can be written to now.
  const canWriteTo = (guestId: string) =>
    members.some((member) => member.guestId === guestId) &&
    !direct.blockedIds.includes(guestId) &&
    !direct.blockedByIds.includes(guestId);

  function selectPerson(partner: Partner) {
    startReply(partner);
    focusMessageBox();
  }
  const replyWaiting =
    replyFailure?.error === "rate_limited" && replyFailure.retryAfterSeconds;

  return (
    <section
      aria-labelledby="room-heading"
      className="grid flex-1 gap-4 md:grid-cols-[1fr_14rem]"
    >
      <div className="flex min-w-0 flex-col md:col-start-1">
        <div className="sticky top-14 z-20 space-y-2 bg-slate-950 pb-2 empty:hidden">
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
              <h3 className="min-w-0 truncate text-lg font-semibold">
                {t("dm.title", { name: direct.active.nickname })}
              </h3>
              {direct.blockedIds.includes(direct.active.guestId) && (
                <BlockedTag />
              )}
              {direct.active.role !== "moderator" &&
                !direct.blockedIds.includes(direct.active.guestId) && (
                  <button
                    type="button"
                    onClick={() => void blockActive()}
                    aria-label={t("dm.block", { name: direct.active.nickname })}
                    className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-sm hover:bg-slate-700"
                  >
                    <Ban aria-hidden="true" className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {t("dm.block", { name: direct.active.nickname })}
                    </span>
                  </button>
                )}
            </div>
          )}

          {direct.active && blockFailure && (
            <ErrorAlert code={blockFailure.error} />
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
            blockedBy={direct.blockedByIds.includes(direct.active.guestId)}
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
              {runs(items, runAuthor).map((run) => {
                const first = run[0];

                if (first.kind === "event") {
                  return (
                    <StatusRow
                      key={first.event.id}
                      text={t(`room.${first.event.event}`, {
                        name: first.event.nickname,
                      })}
                      sentAt={first.event.sentAt}
                    />
                  );
                }

                if (first.kind === "notice") {
                  return (
                    <StatusRow
                      key={first.status.id}
                      text={t(`dm.${first.status.event}`, {
                        name: first.partner.nickname,
                      })}
                      sentAt={first.status.sentAt}
                    />
                  );
                }

                if (first.kind === "direct") {
                  const entries = run as DirectItem[];
                  const mine = ownGuestIds.includes(first.message.fromGuestId);

                  return (
                    <MessageGroup
                      key={first.message.id}
                      mine={mine}
                      nickname={first.partner.nickname}
                      role={first.partner.role}
                      avatar={first.partner.avatar}
                      blocked={direct.blockedIds.includes(
                        first.partner.guestId,
                      )}
                      direct={{
                        label: t(mine ? "dm.to" : "dm.from", {
                          name: first.partner.nickname,
                        }),
                      }}
                      messages={entries.map(({ message }) => ({
                        id: message.id,
                        text: message.text,
                        sentAt: message.sentAt,
                        banned: message.banned,
                      }))}
                      onSelect={() => selectPerson(first.partner)}
                      selectable={canWriteTo(first.partner.guestId)}
                      nav={{ stopId: rows.stopId }}
                    />
                  );
                }

                if (first.message.banned) {
                  return (
                    <li
                      key={first.message.id}
                      {...navStop(
                        first.message.id,
                        first.message.id === rows.stopId,
                      )}
                      className={`-mx-2 rounded-lg px-2 py-1 ${NAV_STOP_CLASS}`}
                    >
                      <span className="font-semibold italic text-red-400">
                        {t("room.bannedMessage")}
                      </span>
                      <Timestamp
                        sentAt={first.message.sentAt}
                        className="ml-2 text-xs text-slate-500"
                      />
                    </li>
                  );
                }

                const entries = run as MessageItem[];
                const author: Partner = {
                  guestId: first.message.guestId,
                  nickname: first.message.nickname,
                  role: first.message.role ?? "guest",
                  avatar: first.message.avatar ?? PLAIN_AVATAR,
                };
                const mine = ownGuestIds.includes(author.guestId);

                return (
                  <MessageGroup
                    key={first.message.id}
                    mine={mine}
                    nickname={author.nickname}
                    role={author.role}
                    avatar={author.avatar}
                    blocked={direct.blockedIds.includes(author.guestId)}
                    messages={entries.map(({ message }) => ({
                      id: message.id,
                      text: message.text,
                      sentAt: message.sentAt,
                      reactions: message.reactions,
                    }))}
                    selectable={canWriteTo(author.guestId)}
                    onSelect={mine ? undefined : () => selectPerson(author)}
                    nav={{ stopId: rows.stopId }}
                    reactions={{ ownIds: ownGuestIds, onReact }}
                  />
                );
              })}{" "}
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

              {composer.gif && (
                <AttachedGif
                  url={composer.gif}
                  onRemove={() => composer.setGif(null)}
                />
              )}

              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <RecipientPicker
                  recipients={recipients}
                  value={replyTo}
                  onChange={chooseRecipient}
                  threads={direct.threads}
                  onOpenThread={openConversation}
                  notify={direct.notify}
                  onNotifyChange={direct.setNotify}
                  onSetMuted={direct.setMuted}
                  blockedIds={direct.blockedIds}
                  blockedByIds={direct.blockedByIds}
                  onSetBlocked={direct.setBlocked}
                />
                <label htmlFor="message" className="sr-only">
                  {replyTo
                    ? t("dm.label", { name: replyTo.nickname })
                    : t("room.messageLabel")}
                </label>
                <MessageInput
                  id="message"
                  value={composer.text}
                  reserve={composer.reserve}
                  onChange={(event) => composer.setText(event.target.value)}
                  autoComplete="off"
                  disabled={!canWrite}
                  placeholder={
                    replyBlockedBy && replyTo
                      ? t("dm.blockedByPlaceholder", { name: replyTo.nickname })
                      : replyBlocked && replyTo
                        ? t("dm.blockedPlaceholder", { name: replyTo.nickname })
                        : replyTo
                          ? t("dm.replyPlaceholder", { name: replyTo.nickname })
                          : t("room.messagePlaceholder")
                  }
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
                />
                <ComposerPicker
                  disabled={!canWrite}
                  onEmoji={composer.addEmoji}
                  onGif={composer.setGif}
                  onClosed={composer.focusBox}
                />
                <button
                  type="submit"
                  disabled={!canWrite}
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

              {replyTo && replyBlockedBy && (
                <p role="status" className="text-sm text-amber-300">
                  {t("dm.blockedByWrite", { name: replyTo.nickname })}
                </p>
              )}

              {replyTo && replyBlocked && (
                <p role="status" className="text-sm text-amber-300">
                  {t("dm.blockedWrite", { name: replyTo.nickname })}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      void direct.setBlocked(replyTo.guestId, false)
                    }
                    className="font-semibold underline hover:text-amber-200"
                  >
                    {t("dm.unblockAction")}
                  </button>
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
          notify={direct.notify}
          blockedIds={direct.blockedIds}
          blockedByIds={direct.blockedByIds}
          onSetBlocked={direct.setBlocked}
          onNotifyChange={direct.setNotify}
          onSetMuted={direct.setMuted}
        />
      </aside>
    </section>
  );
}
