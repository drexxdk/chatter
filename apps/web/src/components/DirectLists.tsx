import { useTranslation } from "react-i18next";

import type { DirectThread, Partner } from "../chat/direct";
import { PLAIN_AVATAR } from "../chat/avatar";
import type { Member } from "../chat/useChat";
import { AvatarIcon } from "./Avatar";

const nameClass = (role: Partner["role"]) =>
  role === "moderator" ? "font-bold text-green-400" : undefined;

// Everybody in the room, the guest included (not clickable: there is nobody to write to). A name opens a conversation,
// which is only listed below once something has been said.
export function PeopleList({
  members,
  selfGuestId,
  onOpen,
}: {
  members: Member[];
  selfGuestId: string;
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
                onClick={() =>
                  onOpen({
                    guestId: member.guestId,
                    nickname: member.nickname,
                    role,
                    avatar,
                  })
                }
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-800"
              >
                <AvatarIcon avatar={avatar} small />
                <span className={nameClass(role)}>{member.nickname}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Conversations with something in them, the one with the latest activity first. One with new words pulses (unless the
// person has asked for less motion) and shows a count, which is also what a screen reader is told.
export function ThreadList({
  threads,
  onOpen,
}: {
  threads: DirectThread[];
  onOpen: (partner: Partner) => void;
}) {
  const { t } = useTranslation();

  if (threads.length === 0) {
    return <p className="text-sm text-slate-500">{t("dm.none")}</p>;
  }

  return (
    <ul aria-label={t("dm.list")} className="space-y-1 text-sm">
      {threads.map((thread) => (
        <li key={thread.guestId}>
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
                ? "flex w-full items-center justify-between gap-2 rounded border border-amber-400 bg-amber-400/15 px-2 py-1 text-left motion-safe:animate-pulse"
                : "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-slate-800"
            }
          >
            <span className="flex items-center gap-2">
              <AvatarIcon avatar={thread.avatar} small />
              <span className={nameClass(thread.role)}>{thread.nickname}</span>
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
        </li>
      ))}
    </ul>
  );
}
