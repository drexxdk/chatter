import { Field, Label, Switch } from "@headlessui/react";
import { Ban, Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DirectThread, Partner } from "../chat/direct";
import { PLAIN_AVATAR } from "../chat/avatar";
import type { Member } from "../chat/useChat";
import { AvatarIcon } from "./Avatar";

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
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-700 px-1.5 py-0.5 text-xs font-semibold text-slate-300">
      <Ban aria-hidden="true" className="h-3 w-3" />
      {t("dm.blockedByTag")}
    </span>
  );
}

// Everybody in the room, the guest included (not clickable: there is nobody to write to). A name opens a conversation,
// which is only listed below once something has been said.
export function PeopleList({
  members,
  selfGuestId,
  blockedIds,
  blockedByIds,
  onOpen,
}: {
  members: Member[];
  selfGuestId: string;
  blockedIds: string[];
  // Whoever has blocked the guest is greyed out: there is nothing to write to them.
  blockedByIds: string[];
  onOpen: (partner: Partner) => void;
}) {
  const { t } = useTranslation();

  return (
    <ul aria-label={t("room.people")} className="space-y-1 text-sm">
      {members.map((member) => {
        const role = member.role ?? "guest";
        const avatar = member.avatar ?? PLAIN_AVATAR;

        return (
          <li key={member.guestId}>
            {member.guestId === selfGuestId ? (
              <span className="flex items-center gap-2 px-2 py-1">
                <AvatarIcon avatar={avatar} small />
                <span>
                  <span className={nameClass(role)}>{member.nickname}</span>
                  <span className="ml-1 text-slate-500">({t("room.you")})</span>
                </span>
              </span>
            ) : (
              <button
                type="button"
                disabled={blockedByIds.includes(member.guestId)}
                onClick={() =>
                  onOpen({
                    guestId: member.guestId,
                    nickname: member.nickname,
                    role,
                    avatar,
                  })
                }
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <AvatarIcon avatar={avatar} small />
                <span className={nameClass(role)}>{member.nickname}</span>
                {blockedIds.includes(member.guestId) && <BlockedTag />}
                {blockedByIds.includes(member.guestId) && <BlockedByTag />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Conversations with something in them, the one with the latest activity first. One with new words pulses (unless the
// person has asked for less motion) and shows a count, which is also what a screen reader is told. The bell beside each
// one switches off being told about that person.
export function ThreadList({
  threads,
  notify,
  blockedIds,
  onOpen,
  onSetMuted,
  onSetBlocked,
}: {
  threads: DirectThread[];
  // Whether notifications are on at all; the bells have nothing to do while they are not.
  notify: boolean;
  blockedIds: string[];
  onOpen: (partner: Partner) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();

  if (threads.length === 0) {
    return <p className="text-sm text-slate-500">{t("dm.none")}</p>;
  }

  return (
    <ul aria-label={t("dm.list")} className="space-y-1 text-sm">
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
              })
            }
            className={
              thread.unread > 0
                ? "flex min-w-0 flex-1 items-center justify-between gap-2 rounded border border-amber-400 bg-amber-400/15 px-2 py-1 text-left motion-safe:animate-pulse"
                : "flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-slate-800"
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <AvatarIcon avatar={thread.avatar} small />
              <span className={`truncate ${nameClass(thread.role) ?? ""}`}>
                {thread.nickname}
              </span>
              {blockedIds.includes(thread.guestId) && <BlockedTag />}
              {thread.blockedBy && !blockedIds.includes(thread.guestId) && (
                <BlockedByTag />
              )}
            </span>
            {thread.unread > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="rounded-full bg-amber-400 px-2 text-xs font-bold text-slate-950"
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
          {blockedIds.includes(thread.guestId) ? (
            <button
              type="button"
              onClick={() => onSetBlocked(thread.guestId, false)}
              aria-label={t("dm.unblock", { name: thread.nickname })}
              className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-slate-200 underline hover:bg-slate-800"
            >
              {t("dm.unblockAction")}
            </button>
          ) : (
            <button
              type="button"
              aria-pressed={thread.muted === true}
              disabled={!notify}
              onClick={() => onSetMuted(thread.guestId, !thread.muted)}
              aria-label={t(thread.muted ? "dm.unmuteFrom" : "dm.muteFrom", {
                name: thread.nickname,
              })}
              title={t(thread.muted ? "dm.unmuteFrom" : "dm.muteFrom", {
                name: thread.nickname,
              })}
              className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {thread.muted ? (
                <BellOff aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Bell aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// The conversations with the switch for being told about new messages in any of them, above the list.
export function ThreadSection({
  threads,
  notify,
  blockedIds,
  onNotifyChange,
  onOpen,
  onSetMuted,
  onSetBlocked,
}: {
  threads: DirectThread[];
  notify: boolean;
  blockedIds: string[];
  onNotifyChange: (notify: boolean) => void;
  onOpen: (partner: Partner) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-300">
        {t("dm.heading")}
      </h3>
      <Field className="flex items-center justify-between gap-2 text-sm text-slate-300">
        <Label>{t("dm.notify")}</Label>
        <Switch
          checked={notify}
          onChange={onNotifyChange}
          className="group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-700 outline-none transition-colors data-checked:bg-indigo-500 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
        >
          <span className="size-4 translate-x-0.5 rounded-full bg-white transition-transform group-data-checked:translate-x-4.5" />
        </Switch>
      </Field>
      <ThreadList
        threads={threads}
        notify={notify}
        blockedIds={blockedIds}
        onOpen={onOpen}
        onSetMuted={onSetMuted}
        onSetBlocked={onSetBlocked}
      />
    </div>
  );
}
