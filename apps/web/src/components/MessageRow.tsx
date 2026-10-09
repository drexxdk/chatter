import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Avatar } from "../chat/avatar";
import type { Partner } from "../chat/direct";
import type { Role } from "../chat/useChat";
import { AvatarIcon } from "./Avatar";

// One line of a conversation, in a room or between two people: what others say sits on the left with their avatar,
// what the guest says on the right. A moderator's words keep their green, bold look either way. A `menu` covers the
// row so the whole of it can be clicked.
export function MessageRow({
  mine,
  nickname,
  role,
  avatar,
  sentAt,
  text,
  menu,
}: {
  mine: boolean;
  nickname: string;
  role: Role;
  avatar: Avatar;
  sentAt: string;
  text: string;
  menu?: ReactNode;
}) {
  const { t } = useTranslation();
  const moderator = role === "moderator";

  return (
    <li
      data-side={mine ? "right" : "left"}
      className={`relative -mx-2 flex items-end gap-2 rounded-lg px-2 py-1 ${mine ? "flex-row-reverse" : ""}`}
    >
      {!mine && <AvatarIcon avatar={avatar} />}
      <div
        className={`flex min-w-0 max-w-[80%] flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-2 text-xs">
          <span
            className={
              moderator
                ? "font-bold text-green-400"
                : mine
                  ? "font-semibold text-indigo-300"
                  : "font-semibold"
            }
          >
            {nickname}
          </span>
          {moderator && (
            <span className="rounded bg-green-500/20 px-1.5 py-0.5 font-semibold uppercase text-green-300">
              {t("room.moderatorBadge")}
            </span>
          )}
          <time dateTime={sentAt} className="text-slate-500">
            {new Date(sentAt).toLocaleTimeString()}
          </time>
        </div>
        {/* Rendered as text, never as HTML. */}
        <p
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${
            moderator
              ? "border border-green-500/40 bg-green-900/30 font-bold text-green-300"
              : mine
                ? "rounded-br-sm bg-indigo-600 text-white"
                : "rounded-bl-sm bg-slate-800"
          }`}
        >
          {text}
        </p>
      </div>
      {menu}
    </li>
  );
}

// A private message shown among the room's: marked as direct, and on the side of whoever wrote it.
export function DirectRow({
  mine,
  partner,
  sentAt,
  text,
  banned,
  menu,
}: {
  mine: boolean;
  partner: Partner;
  sentAt: string;
  text: string;
  banned?: boolean;
  menu?: ReactNode;
}) {
  const { t } = useTranslation();
  const label = t(mine ? "dm.to" : "dm.from", { name: partner.nickname });

  return (
    <li
      data-kind="direct"
      data-side={mine ? "right" : "left"}
      className={`relative -mx-2 flex items-end gap-2 rounded-lg px-2 py-1 ${mine ? "flex-row-reverse" : ""}`}
    >
      {!mine && <AvatarIcon avatar={partner.avatar} />}
      <div
        className={`flex min-w-0 max-w-[80%] flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-amber-300">{label}</span>
          <time dateTime={sentAt} className="text-slate-500">
            {new Date(sentAt).toLocaleTimeString()}
          </time>
        </div>
        {/* Rendered as text, never as HTML. */}
        <p
          className={`whitespace-pre-wrap break-words rounded-2xl border border-dashed border-amber-400/60 bg-amber-400/10 px-3 py-1 ${
            banned ? "font-semibold italic text-red-400" : ""
          }`}
        >
          {banned ? t("room.bannedMessage") : text}
        </p>
      </div>
      {menu}
    </li>
  );
}

// Something that happened rather than something said, so it looks different from a message.
export function StatusRow({ text, sentAt }: { text: string; sentAt: string }) {
  return (
    <li
      data-kind="status"
      className="flex items-center justify-center gap-2 text-xs"
    >
      <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-300">
        {text}
      </span>
      <time dateTime={sentAt} className="text-slate-500">
        {new Date(sentAt).toLocaleTimeString()}
      </time>
    </li>
  );
}
