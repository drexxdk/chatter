import { ArrowRight, Ban } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DirectThread, Partner } from "../chat/direct";
import { PLAIN_AVATAR } from "../chat/avatar";
import type { Member } from "../chat/useChat";
import { AvatarIcon, GenderMark } from "./Avatar";
import { ThreadActions } from "./ThreadActions";
import { IdentityName, IdentityProfile, useIdentityNames } from "./Identity";

const nameClass = (role: Partner["role"]) =>
  role === "moderator" ? "font-bold text-green-400" : undefined;

// Marks somebody the guest has blocked, in words as well as the icon.
export function BlockedTag() {
  const { t } = useTranslation();

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-300">
      <Ban aria-hidden="true" className="h-3 w-3" />
      {t("dm.blockedTag")}
    </span>
  );
}

// Marks somebody who has blocked the guest: nothing written to them gets through.
export function BlockedByTag() {
  const { t } = useTranslation();

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-neutral-700 px-1.5 py-0.5 text-xs font-semibold text-neutral-300">
      <Ban aria-hidden="true" className="h-3 w-3" />
      {t("dm.blockedByTag")}
    </span>
  );
}

// How old somebody said they are, shown small next to their name.
function AgeBadge({ age }: { age?: number }) {
  const { t } = useTranslation();

  if (age === undefined) return null;

  return (
    <span className="shrink-0 text-xs text-neutral-400">
      <span aria-hidden="true">{age}</span>
      <span className="sr-only">{t("profile.years", { count: age })}</span>
    </span>
  );
}

// Everybody in the room, the guest included (who has nobody to write to there). A name chooses the person to write to
// privately (and chooses nobody again when it is clicked once more); the arrow beside it goes into the private chat, which
// is only listed below once something has been said.
function PeopleListView({
  members,
  selfGuestId,
  selectedId = null,
  blockedIds,
  blockedByIds,
  onSelect,
  onOpen,
}: {
  members: Member[];
  selfGuestId: string;
  // Who the message box writes to privately now.
  selectedId?: string | null;
  blockedIds: string[];
  // Whoever has blocked the guest is greyed out: there is nothing to write to them.
  blockedByIds: string[];
  onSelect: (partner: Partner) => void;
  onOpen: (partner: Partner) => void;
}) {
  const { t } = useTranslation();
  const names = useIdentityNames();

  return (
    <ul aria-label={t("room.people")} className="space-y-1 text-sm">
      {members.map((member) => {
        const role = member.role ?? "guest";
        const avatar = member.avatar ?? PLAIN_AVATAR;
        const partner: Partner = {
          guestId: member.guestId,
          nickname: member.nickname,
          role,
          avatar,
          ...(member.picture ? { picture: member.picture } : {}),
        };
        const blocked = blockedIds.includes(member.guestId);
        const blockedBy = blockedByIds.includes(member.guestId);
        const selected = selectedId === member.guestId;

        return (
          <li key={member.guestId}>
            {member.guestId === selfGuestId ? (
              <span className="flex min-w-0 items-center gap-2 px-2 py-1">
                <IdentityProfile person={partner} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`inline-flex max-w-full align-middle ${nameClass(role) ?? ""}`}
                  >
                    <IdentityName person={member} />
                  </span>
                  <GenderMark avatar={avatar} picture={member.picture} />
                  <span className="ml-1 text-neutral-500">
                    ({t("room.you")})
                  </span>
                </span>
                <AgeBadge age={member.age} />
              </span>
            ) : (
              <div
                className={`flex items-center gap-1 rounded ${selected ? "bg-neutral-700/50 ring-1 ring-neutral-500/50" : ""}`}
              >
                <IdentityProfile person={partner} />
                <button
                  type="button"
                  disabled={blocked || blockedBy}
                  aria-pressed={selected}
                  title={t("person.message", {
                    name: names.label(member, true),
                  })}
                  onClick={() => onSelect(partner)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-neutral-800 disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className={`min-w-0 ${nameClass(role) ?? ""}`}>
                    <IdentityName person={member} />
                  </span>
                  <GenderMark avatar={avatar} picture={member.picture} />
                  <AgeBadge age={member.age} />
                  {blocked && <BlockedTag />}
                  {blockedBy && <BlockedByTag />}
                </button>
                <button
                  type="button"
                  disabled={blockedBy}
                  onClick={() => onOpen(partner)}
                  aria-label={t("dm.openWith", { name: names.label(member) })}
                  title={t("dm.openWith", { name: names.label(member, true) })}
                  className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
export const PeopleList = memo(PeopleListView);

// Conversations with something in them, the one with the latest activity first. One with new words pulses (unless the
// person has asked for less motion) and shows a count, which is also what a screen reader is told.
export function ThreadList({
  threads,
  searching = false,
  blockedIds,
  onOpen,
  onSetMuted,
  onSetBlocked,
}: {
  threads: DirectThread[];
  // The list is narrowed by a search, so that having none to show is no news about the conversations.
  searching?: boolean;
  blockedIds: string[];
  onOpen: (partner: Partner) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const list = useRef<HTMLUListElement>(null);
  const [menuWidth, setMenuWidth] = useState<number>();

  useEffect(() => {
    const element = list.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMenuWidth(entry.contentRect.width || undefined);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [threads.length]);

  if (threads.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        {t(searching ? "dm.noMatches" : "dm.none")}
      </p>
    );
  }

  return (
    <ul ref={list} aria-label={t("dm.list")} className="space-y-1 text-sm">
      {threads.map((thread) => (
        <li key={thread.guestId} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onOpen({
                guestId: thread.guestId,
                nickname: thread.nickname,
                role: thread.role,
                avatar: thread.avatar,
                ...(thread.picture ? { picture: thread.picture } : {}),
              })
            }
            className={
              thread.unread > 0
                ? "flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded border border-amber-400 bg-amber-400/15 px-2 py-1 text-left motion-safe:animate-pulse"
                : "flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-neutral-800"
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <AvatarIcon
                avatar={thread.avatar}
                picture={thread.picture}
                small
              />
              <span className={`min-w-0 ${nameClass(thread.role) ?? ""}`}>
                <IdentityName person={thread} />
              </span>
              <GenderMark avatar={thread.avatar} picture={thread.picture} />
              {blockedIds.includes(thread.guestId) && <BlockedTag />}
              {thread.blockedBy && !blockedIds.includes(thread.guestId) && (
                <BlockedByTag />
              )}
            </span>
            {thread.unread > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="rounded-full bg-amber-400 px-2 text-xs font-bold text-neutral-950"
                >
                  {thread.unread}
                </span>
                <span className="sr-only">
                  {" "}
                  {t("dm.unread", { count: thread.unread })}
                </span>
              </>
            )}
          </button>
          <ThreadActions
            thread={thread}
            menuWidth={menuWidth}
            blocked={blockedIds.includes(thread.guestId)}
            onSetMuted={onSetMuted}
            onSetBlocked={onSetBlocked}
          />
        </li>
      ))}
    </ul>
  );
}

// The conversations, above which the heading (where there is one) is. Not used up as a whole: the list scrolls.
export function ThreadSection({
  className = "",
  showHeading = true,
  threads,
  searching,
  blockedIds,
  onOpen,
  onSetMuted,
  onSetBlocked,
}: {
  // For where the section is given a height to share out: its list then scrolls.
  className?: string;
  // Off where the section has a heading of its own.
  showHeading?: boolean;
  threads: DirectThread[];
  searching?: boolean;
  blockedIds: string[];
  onOpen: (partner: Partner) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {showHeading && (
        <h3 className="text-sm font-semibold text-neutral-300">
          {t("dm.heading")}
        </h3>
      )}
      <div className="panel-list">
        <ThreadList
          threads={threads}
          searching={searching}
          blockedIds={blockedIds}
          onOpen={onOpen}
          onSetMuted={onSetMuted}
          onSetBlocked={onSetBlocked}
        />
      </div>
    </div>
  );
}
