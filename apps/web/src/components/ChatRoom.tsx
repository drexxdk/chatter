import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  LockKeyhole,
  Megaphone,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  ActionResult,
  Announcement,
  AnnounceResult,
  ChatMessage,
  DirectApi,
  Member,
  Session,
} from "../chat/useChat";
import { PLAIN_AVATAR } from "../chat/avatar";
import { isStatus, type Partner } from "../chat/direct";
import { runs } from "../chat/runs";
import type { ReportReason } from "../chat/types";
import { useComposer } from "../chat/useComposer";
import type { TypingApi } from "../chat/useTyping";
import { TypingIndicator } from "./TypingIndicator";
import { readTabDraft } from "../tabDraft";
import { useRetryCountdown } from "../chat/useRetryCountdown";
import {
  timeline,
  withDirect,
  type RoomEvent,
  type TimelineItem,
} from "../chat/roomEvents";
import { focusMessageBox } from "../focusMessageBox";
import { MESSAGE_READING_EVENT } from "../messageNavigation";
import { NAV_STOP_CLASS, navStop, useRowNavigation } from "../rowNavigation";
import { useKept } from "../useKept";
import { DirectChat } from "./DirectChat";
import { BlockedTag } from "./DirectLists";
import { ComposerBar } from "./ComposerBar";
import { Timestamp } from "./Timestamp";
import { ErrorAlert } from "./ErrorAlert";
import { MessageGroup, StatusRow } from "./MessageRow";
import { MessageLog } from "./MessageLog";
import { Notice } from "./Notice";
import { MentionsProvider, type MentionsValue } from "./Mentions";
import type { PersonMenuOptions } from "./PersonMenu";
import { ReportDialog } from "./ReportDialog";
import { RoomPanel, RoomPanelDropdown } from "./RoomPanel";
import { IdentityProfile, useIdentityNames } from "./Identity";

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
  roomSlug: string;
  roomName: string;
  // Absent or null means the room has no limit.
  maxMembers?: number | null;
  session: Session;
  ownGuestIds: string[];
  connected: boolean;
  members: Member[];
  messages: ChatMessage[];
  announcements: Announcement[];
  events: RoomEvent[];
  // Whether the room's log also tells who came and went.
  showMovements: boolean;
  error: string | null;
  retryAfterSeconds: number | null;
  // Removes the room's error, when the guest closes its message.
  onClearError: () => void;
  onSend: (text: string) => Promise<boolean>;
  onReact: (messageId: string, emoji: string) => void;
  onReport: (messageId: string, reason: ReportReason) => Promise<ActionResult>;
  onAnnounce: (text: string) => Promise<AnnounceResult>;
  direct: DirectApi;
  typing: TypingApi;
  // When the guest is disconnected for doing nothing, once they have been warned (milliseconds since 1970).
  idleDeadline: number | null;
}

export function ChatRoom({
  roomSlug,
  roomName,
  maxMembers,
  session,
  ownGuestIds,
  connected,
  members,
  messages,
  announcements,
  events,
  showMovements,
  error,
  retryAfterSeconds,
  onClearError,
  onSend,
  onReact,
  onReport,
  onAnnounce,
  direct,
  typing,
  idleDeadline,
}: ChatRoomProps) {
  const { t } = useTranslation();
  const names = useIdentityNames();
  const draftKey = `composer:${roomSlug}:public`;
  const [replyTo, setReplyTo] = useState<Partner | null>(() => {
    const saved = readTabDraft(draftKey);
    if (
      !saved ||
      typeof saved !== "object" ||
      !("recipient" in saved) ||
      typeof saved.recipient !== "string"
    )
      return null;
    const member = members.find(
      (person) =>
        person.guestId === saved.recipient &&
        person.guestId !== session.guestId,
    );
    if (member)
      return {
        ...member,
        role: member.role ?? "guest",
        avatar: member.avatar ?? PLAIN_AVATAR,
      };
    return (
      direct.threads.find((person) => person.guestId === saved.recipient) ??
      null
    );
  });
  const composer = useComposer(draftKey, replyTo?.guestId);
  // The message the guest is reporting, and who wrote it, while the dialog asks why.
  const [reporting, setReporting] = useState<{
    id: string;
    nickname: string;
  } | null>(null);
  const shownReport = useKept(reporting);
  const items = withDirect(
    timeline(messages, showMovements ? events : [], announcements),
    direct.threads,
  );
  // Who the room's input writes to privately, when a private message was clicked.
  const unread = direct.threads.reduce((sum, thread) => sum + thread.unread, 0);

  const [replyFailure, setReplyFailure] = useState<
    ActionResult & { ok: false }
  >();
  useRetryCountdown(replyFailure, setReplyFailure);
  // A moderator can send what is written as an announcement, to everybody and not to the one written to privately.
  const isModerator = session.role === "moderator";
  const [announce, setAnnounce] = useState(false);
  const [announceFailure, setAnnounceFailure] = useState<
    AnnounceResult & { ok: false }
  >();
  useRetryCountdown(announceFailure, setAnnounceFailure);
  const announceWaiting =
    announceFailure?.error === "rate_limited" &&
    announceFailure.retryAfterSeconds;
  const replyPresent = !replyTo || direct.isPresent(replyTo.guestId);
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
    item.kind === "announcement"
      ? [`announcement:${item.announcement.id}`]
      : item.kind === "event" || item.kind === "notice"
        ? []
        : [item.message.id],
  );
  const rows = useRowNavigation(navIds);

  // Whether the page is at its end, so that something new only scrolls it when the guest is not reading further up.
  const atBottom = useRef(true);
  const root = useRef<HTMLElement>(null);
  // Whether it is exactly at its end, which only then follows the page getting longer.
  const pinned = useRef(true);
  useEffect(() => {
    const element = root.current;
    const reading = () => {
      atBottom.current = false;
      pinned.current = false;
    };
    element?.addEventListener(MESSAGE_READING_EVENT, reading);
    return () => element?.removeEventListener(MESSAGE_READING_EVENT, reading);
  }, []);
  useEffect(() => {
    const page = document.documentElement;
    let viewportHeight = page.clientHeight;
    let contentHeight = page.scrollHeight;
    const update = () => {
      if (
        page.clientHeight !== viewportHeight ||
        page.scrollHeight !== contentHeight
      ) {
        viewportHeight = page.clientHeight;
        contentHeight = page.scrollHeight;
        if (pinned.current) scrollToEnd();
      }
      const distance = page.scrollHeight - page.scrollTop - page.clientHeight;

      atBottom.current = distance < 120;
      pinned.current = distance < 2;
    };

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollToEnd = () => {
    // A room on its way out (made inert while it fades) is only for the eyes: the page belongs to what replaces it.
    if (root.current?.closest("[inert]")) return;

    const page = document.documentElement;
    page.scrollTop = page.scrollHeight;
  };

  // Whatever makes the page longer under a guest who is exactly at its end keeps them there: a picture arriving, or the
  // page being briefly narrower, and so shorter, while a dialog closes. Not when they have scrolled up even a little.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (pinned.current) scrollToEnd();
    });
    observer.observe(document.body);

    return () => observer.disconnect();
  }, []);

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

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    if (announce && isModerator) {
      const text = composer.text.trim();
      if (!text) return;

      const result = await onAnnounce(text);
      if (result.ok) {
        composer.clear();
        setAnnounceFailure(undefined);
        setAnnounce(false);
      } else {
        setAnnounceFailure(result);
      }
      return;
    }

    const value = composer.message;
    if (!value || replyBlocked || replyBlockedBy) return;

    if (await deliver(value)) composer.clear();
  }

  function chooseSendMode(active: boolean) {
    setAnnounce(active);
    setAnnounceFailure(undefined);
    if (active) startReply(null);
    focusMessageBox();
  }

  function startReply(partner: Partner | null) {
    setReplyTo(partner);
    setReplyFailure(undefined);
    // Writing to one person is not an announcement to everybody.
    if (partner) setAnnounce(false);
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
        ...(member.picture ? { picture: member.picture } : {}),
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

  function closeConversation() {
    direct.close();
    focusMessageBox();
  }

  // A click on somebody's message chooses them to write to privately, if they can be written to now.
  const canWriteTo = (guestId: string) =>
    direct.isPresent(guestId) &&
    !direct.blockedIds.includes(guestId) &&
    !direct.blockedByIds.includes(guestId);

  function selectPerson(partner: Partner) {
    // Choosing them to write to means that what they wrote has been seen.
    direct.markRead(partner.guestId);
    startReply(partner);
    focusMessageBox();
  }

  // A click on a person in the list: they are who the message box writes to privately, or nobody again if they already were.
  function toggleRecipient(partner: Partner) {
    if (!canWriteTo(partner.guestId)) return;
    if (replyTo?.guestId === partner.guestId) chooseRecipient(null);
    else selectPerson(partner);
  }

  // Whether somebody is in the room; while the connection is down nobody can be told to have left.
  const hasLeft = (guestId: string) => connected && !direct.isPresent(guestId);

  // The stop of the arrow keys, for the group it is in; the others are told there is none, so that they are not drawn
  // again each time it moves (it follows the newest message).
  const stopIn = (entries: { message: { id: string } }[]) =>
    entries.some(({ message }) => message.id === rows.stopId)
      ? rows.stopId
      : null;

  // What the rows call, always as it is now: a row is only drawn again when what it shows has changed, not for a new
  // function, so what it holds must not go stale.
  const act = useRef({
    selectPerson,
    toggleRecipient,
    openConversation,
    canWriteTo,
    markRead: direct.markRead,
    setBlocked: direct.setBlocked,
    react: direct.react,
    onReact,
  });
  act.current = {
    selectPerson,
    toggleRecipient,
    openConversation,
    canWriteTo,
    markRead: direct.markRead,
    setBlocked: direct.setBlocked,
    react: direct.react,
    onReact,
  };
  const toggleRecipientStable = useCallback(
    (partner: Partner) => act.current.toggleRecipient(partner),
    [],
  );
  const openConversationStable = useCallback(
    (partner: Partner) => act.current.openConversation(partner),
    [],
  );

  // What the "…" button of somebody's message offers.
  function personMenu(partner: Partner): PersonMenuOptions {
    const blocked = direct.blockedIds.includes(partner.guestId);

    return {
      partner,
      present: direct.isPresent(partner.guestId),
      hasConversation: direct.threads.some(
        (thread) =>
          thread.guestId === partner.guestId &&
          thread.entries.some((entry) => !isStatus(entry)),
      ),
      blocked,
      blockedBy: direct.blockedByIds.includes(partner.guestId),
      onMessage: () => act.current.selectPerson(partner),
      onOpenChat: () => act.current.openConversation(partner),
      onToggleBlock: () =>
        void act.current
          .setBlocked(partner.guestId, !blocked)
          .then((result) => setReplyFailure(result.ok ? undefined : result)),
    };
  }
  const replyWaiting =
    replyFailure?.error === "rate_limited" && replyFailure.retryAfterSeconds;

  // Names in messages that are people in the room: hovered they say who they are, clicked they choose who to write to.
  // The same value until somebody comes or goes, or something is blocked, so that the names in the messages are not drawn
  // again for nothing.
  const mentions = useMemo<MentionsValue>(
    () => ({
      people: members,
      selfGuestId: session.guestId,
      canWriteTo: (guestId) => act.current.canWriteTo(guestId),
      onSelect: (person) =>
        act.current.selectPerson({
          guestId: person.guestId,
          nickname: person.nickname,
          role: person.role ?? "guest",
          avatar: person.avatar ?? PLAIN_AVATAR,
        }),
    }),
    // canWriteTo reads the blocks as they are, which is why a change to them makes a new value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, session.guestId, direct.blockedIds, direct.blockedByIds],
  );

  return (
    <MentionsProvider value={mentions}>
      <section
        ref={root}
        aria-labelledby="room-heading"
        className="@container grid flex-1 gap-4 md:grid-cols-[14rem_1fr]"
      >
        <div className="flex min-w-0 flex-col md:col-start-2 md:w-full md:max-w-4xl md:justify-self-center">
          <div className="sticky top-(--header-height) z-20 -mt-4 space-y-2 bg-neutral-950 pb-2 pt-4 empty:hidden">
            {direct.active && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeConversation}
                  aria-label={t("dm.back")}
                  className="rounded-md bg-neutral-800 p-1.5 hover:bg-neutral-700"
                >
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <h3 className="min-w-0 truncate text-lg font-semibold">
                  {t("dm.title", { name: names.label(direct.active) })}
                </h3>
                <IdentityProfile person={direct.active} />
                {direct.blockedIds.includes(direct.active.guestId) && (
                  <BlockedTag />
                )}
                {direct.active.role !== "moderator" &&
                  !direct.blockedIds.includes(direct.active.guestId) && (
                    <button
                      type="button"
                      onClick={() => void blockActive()}
                      aria-label={t("dm.block", {
                        name: names.label(direct.active),
                      })}
                      className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md bg-neutral-800 px-2.5 py-1.5 text-sm hover:bg-neutral-700"
                    >
                      <Ban aria-hidden="true" className="h-4 w-4" />
                      <span className="hidden sm:inline">
                        {t("dm.block", { name: names.label(direct.active) })}
                      </span>
                    </button>
                  )}
              </div>
            )}

            {direct.active && blockFailure && (
              <ErrorAlert
                code={blockFailure.error}
                values={{ name: names.label(direct.active) }}
                onDismiss={() => setBlockFailure(undefined)}
              />
            )}

            {!connected && (
              <Notice role="status">{t("room.reconnecting")}</Notice>
            )}
          </div>

          {direct.active && (
            <DirectChat
              key={direct.active.guestId}
              draftKey={`composer:private:${direct.active.guestId}`}
              partner={direct.active}
              typing={typing}
              typingBlockedIds={[...direct.blockedIds, ...direct.blockedByIds]}
              ownGuestIds={ownGuestIds}
              ownNickname={session.nickname}
              present={direct.isPresent(direct.active.guestId)}
              blocked={direct.blockedIds.includes(direct.active.guestId)}
              blockedBy={direct.blockedByIds.includes(direct.active.guestId)}
              onSend={(text) => direct.send(direct.active!.guestId, text)}
              onReact={(messageId, emoji) =>
                void direct.react(direct.active!.guestId, messageId, emoji)
              }
              onSetBlocked={(blocked) =>
                direct.setBlocked(direct.active!.guestId, blocked)
              }
              idleDeadline={idleDeadline}
            />
          )}

          {/* Stays in the page, out of sight, while a private chat is open: drawing a long room again is what made coming back slow. After the private chat in the page, so that the keyboard's way to the box finds that one first. */}
          <div hidden={direct.active !== null} className="flex flex-1 flex-col">
            <MessageLog
              label={roomName}
              active={direct.active === null}
              onFocus={rows.onFocus}
              onBlur={rows.onBlur}
              onKeyDownCapture={rows.onKeyDownCapture}
            >
              {runs(items, runAuthor).map((run) => {
                const first = run[0];

                if (first.kind === "announcement") {
                  const announcement = first.announcement;
                  const id = `announcement:${announcement.id}`;
                  return (
                    <li
                      key={id}
                      data-kind="announcement"
                      data-live-message={`${t("announcement.from", { name: announcement.name })}: ${announcement.text}`}
                      {...navStop(id, id === rows.stopId)}
                      className={`rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 ${NAV_STOP_CLASS}`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-green-400">
                        <Megaphone
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="font-semibold">
                          {t("announcement.from", { name: announcement.name })}
                        </span>
                        <Timestamp
                          sentAt={announcement.sentAt}
                          className="text-neutral-500"
                        />
                      </div>
                      <p className="whitespace-pre-wrap wrap-anywhere font-bold text-green-300">
                        {announcement.text}
                      </p>
                    </li>
                  );
                }

                if (first.kind === "event") {
                  return (
                    <StatusRow
                      key={first.event.id}
                      text={
                        ownGuestIds.includes(first.event.guestId)
                          ? t(
                              first.event.event === "joined"
                                ? "room.youJoined"
                                : "room.youLeft",
                            )
                          : t(`room.${first.event.event}`, {
                              name: first.event.nickname,
                            })
                      }
                      sentAt={first.event.sentAt}
                    />
                  );
                }

                if (first.kind === "notice") {
                  return (
                    <StatusRow
                      key={first.status.id}
                      text={t(`dm.${first.status.event}`, {
                        name: names.label(first.partner),
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
                      guestId={first.partner.guestId}
                      mine={mine}
                      nickname={first.partner.nickname}
                      role={first.partner.role}
                      avatar={first.partner.avatar}
                      picture={first.partner.picture}
                      blocked={direct.blockedIds.includes(
                        first.partner.guestId,
                      )}
                      gone={hasLeft(first.partner.guestId)}
                      direct={{
                        label: t(mine ? "dm.to" : "dm.from", {
                          name: names.label(first.partner),
                        }),
                      }}
                      messages={entries.map(({ message }) => ({
                        id: message.id,
                        text: message.text,
                        sentAt: message.sentAt,
                        banned: message.banned,
                        reactions: message.reactions,
                      }))}
                      onSelect={() => act.current.selectPerson(first.partner)}
                      onSeen={() => act.current.markRead(first.partner.guestId)}
                      selectable={canWriteTo(first.partner.guestId)}
                      nav={{ stopId: stopIn(entries) }}
                      reactions={{
                        ownIds: ownGuestIds,
                        onReact: (messageId, emoji) =>
                          void act.current.react(
                            first.partner.guestId,
                            messageId,
                            emoji,
                          ),
                      }}
                      menu={personMenu(first.partner)}
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
                      <span
                        className={
                          first.message.hidden
                            ? "italic text-neutral-400"
                            : "font-semibold italic text-red-400"
                        }
                      >
                        {t(
                          first.message.hidden
                            ? "room.hiddenMessage"
                            : "room.bannedMessage",
                        )}
                      </span>
                      <Timestamp
                        sentAt={first.message.sentAt}
                        className="ml-2 text-xs text-neutral-500"
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
                  ...(first.message.picture
                    ? { picture: first.message.picture }
                    : {}),
                };
                const mine = ownGuestIds.includes(author.guestId);

                return (
                  <MessageGroup
                    key={first.message.id}
                    guestId={author.guestId}
                    mine={mine}
                    nickname={author.nickname}
                    role={author.role}
                    avatar={author.avatar}
                    picture={author.picture}
                    blocked={direct.blockedIds.includes(author.guestId)}
                    gone={!mine && hasLeft(author.guestId)}
                    messages={entries.map(({ message }) => ({
                      id: message.id,
                      text: message.text,
                      sentAt: message.sentAt,
                      reactions: message.reactions,
                    }))}
                    selectable={canWriteTo(author.guestId)}
                    onSelect={
                      mine ? undefined : () => act.current.selectPerson(author)
                    }
                    onSeen={
                      !mine &&
                      direct.threads.some(
                        (thread) =>
                          thread.guestId === author.guestId &&
                          thread.unread > 0,
                      )
                        ? () => act.current.markRead(author.guestId)
                        : undefined
                    }
                    nav={{ stopId: stopIn(entries) }}
                    reactions={{
                      ownIds: ownGuestIds,
                      onReact: (messageId, emoji) =>
                        act.current.onReact(messageId, emoji),
                    }}
                    menu={mine ? undefined : personMenu(author)}
                    onReport={
                      mine || author.role === "moderator"
                        ? undefined
                        : (messageId) =>
                            setReporting({
                              id: messageId,
                              nickname: names.label(author, true),
                            })
                    }
                  />
                );
              })}
              {items.every((item) => item.kind === "event") && (
                <li className="text-neutral-500">{t("room.empty")}</li>
              )}
            </MessageLog>

            <ComposerBar
              composer={composer}
              id="message"
              typing={{
                update: typing.update,
                toGuestId: replyTo?.guestId,
                enabled: !direct.active && !announce,
              }}
              label={
                announce
                  ? t("announcement.label")
                  : replyTo
                    ? t("dm.label", { name: names.label(replyTo) })
                    : t("room.messageLabel")
              }
              placeholder={
                announce
                  ? t("announcement.placeholder")
                  : replyBlockedBy && replyTo
                    ? t("dm.blockedByPlaceholder", {
                        name: names.label(replyTo),
                      })
                    : replyBlocked && replyTo
                      ? t("dm.blockedPlaceholder", {
                          name: names.label(replyTo),
                        })
                      : replyTo
                        ? t("dm.replyPlaceholder", {
                            name: names.label(replyTo),
                          })
                        : t("room.messagePlaceholder")
              }
              disabled={!canWrite}
              onSubmit={handleSubmit}
              idleDeadline={idleDeadline}
              mentionable={recipients.filter(
                (person) =>
                  members.some((member) => member.guestId === person.guestId) &&
                  !direct.blockedIds.includes(person.guestId),
              )}
              alert={
                <ErrorAlert
                  code={
                    announceFailure
                      ? announceWaiting
                        ? "announce_wait"
                        : announceFailure.error
                      : replyFailure
                        ? replyWaiting
                          ? "rate_limited_wait"
                          : replyFailure.error
                        : error === "rate_limited" && retryAfterSeconds
                          ? "rate_limited_wait"
                          : error
                  }
                  values={{
                    seconds: announceFailure
                      ? announceFailure.retryAfterSeconds
                      : replyFailure
                        ? replyFailure.retryAfterSeconds
                        : retryAfterSeconds,
                    name: replyTo ? names.label(replyTo) : undefined,
                  }}
                  onDismiss={() => {
                    setReplyFailure(undefined);
                    setAnnounceFailure(undefined);
                    onClearError();
                  }}
                />
              }
              announce={
                isModerator
                  ? { active: announce, onChange: chooseSendMode }
                  : undefined
              }
              above={
                <>
                  <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-2">
                    <RoomPanelDropdown
                      roomSlug={roomSlug}
                      unread={unread}
                      members={members}
                      maxMembers={maxMembers}
                      selfGuestId={session.guestId}
                      threads={direct.threads}
                      selectedId={replyTo?.guestId ?? null}
                      onSelect={toggleRecipient}
                      onOpen={openConversation}
                      blockedIds={direct.blockedIds}
                      blockedByIds={direct.blockedByIds}
                      onSetBlocked={direct.setBlocked}
                      onSetMuted={direct.setMuted}
                    />
                    {replyTo ? (
                      <div className="inline-flex min-w-0 max-w-[calc(100%-2.5rem)] items-center overflow-hidden rounded-md border border-neutral-600/60 bg-neutral-800/70 text-xs text-neutral-200">
                        <button
                          type="button"
                          onClick={() => openConversation(replyTo)}
                          title={t("person.openChat")}
                          aria-label={t("person.openChat")}
                          className="flex min-h-8 min-w-0 items-center gap-2 px-2.5 py-1 text-left outline-none hover:bg-white/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--room-accent)"
                        >
                          <LockKeyhole
                            aria-hidden="true"
                            className="size-3.5 shrink-0 text-(--room-accent)"
                          />
                          <span
                            className="min-w-0 wrap-break-word"
                            aria-live="polite"
                          >
                            {t("dm.writingTo", { name: names.label(replyTo) })}
                          </span>
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5 shrink-0 text-neutral-400"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => chooseRecipient(null)}
                          title={t("dm.closeBar")}
                          aria-label={t("dm.closeBar")}
                          className="flex size-8 shrink-0 items-center justify-center border-l border-neutral-600/40 text-neutral-400 outline-none hover:bg-white/5 hover:text-neutral-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--room-accent)"
                        >
                          <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className="min-w-0 text-xs text-neutral-400"
                        aria-live="polite"
                      >
                        {t("info.everyoneHeading")}
                      </span>
                    )}
                    <div className="min-w-0 flex-1 basis-32">
                      <TypingIndicator
                        writers={connected ? typing.writers : []}
                        roomSlug={roomSlug}
                        blockedIds={[
                          ...direct.blockedIds,
                          ...direct.blockedByIds,
                        ]}
                      />
                    </div>
                  </div>

                  {replyTo && !replyPresent && (
                    <Notice role="status">
                      {t("dm.away", { name: names.label(replyTo) })}
                    </Notice>
                  )}

                  {replyTo && replyBlockedBy && (
                    <Notice role="status" tone="neutral" icon={Ban}>
                      {t("dm.blockedByWrite", { name: names.label(replyTo) })}
                    </Notice>
                  )}

                  {replyTo && replyBlocked && (
                    <Notice role="status" tone="error" icon={Ban}>
                      {t("dm.blockedWrite", { name: names.label(replyTo) })}{" "}
                      <button
                        type="button"
                        onClick={() =>
                          void direct.setBlocked(replyTo.guestId, false)
                        }
                        className="font-semibold underline hover:text-red-100"
                      >
                        {t("dm.unblockAction")}
                      </button>
                    </Notice>
                  )}
                </>
              }
            />
          </div>
        </div>

        <aside
          aria-label={t("room.panel")}
          className="panel hidden md:col-start-1 md:row-start-1 md:-mt-4 md:sticky md:top-(--header-height) md:block md:h-[calc(100dvh-var(--header-height))] md:self-start md:overflow-y-auto md:border-r md:border-neutral-800 md:py-4 md:pr-3"
        >
          <RoomPanel
            roomSlug={roomSlug}
            members={members}
            maxMembers={maxMembers}
            selfGuestId={session.guestId}
            threads={direct.threads}
            selectedId={replyTo?.guestId ?? null}
            onSelect={toggleRecipientStable}
            onOpen={openConversationStable}
            blockedIds={direct.blockedIds}
            blockedByIds={direct.blockedByIds}
            onSetBlocked={direct.setBlocked}
            onSetMuted={direct.setMuted}
          />
        </aside>
      </section>
      {shownReport && (
        <ReportDialog
          key={shownReport.id}
          open={reporting !== null}
          nickname={shownReport.nickname}
          onCancel={() => setReporting(null)}
          onSubmit={async (reason) => {
            const result = await onReport(shownReport.id, reason);
            if (result.ok) setReporting(null);
            return result;
          }}
        />
      )}
    </MentionsProvider>
  );
}
