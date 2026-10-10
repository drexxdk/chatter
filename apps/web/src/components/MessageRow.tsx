import { useTranslation } from "react-i18next";

import type { Avatar } from "../chat/avatar";
import { gifOf } from "../chat/gifs";
import type { Role } from "../chat/useChat";
import { NAV_STOP_CLASS, navStop } from "../rowNavigation";
import { AvatarIcon } from "./Avatar";
import { BlockedTag } from "./DirectLists";
import { GifImage } from "./GifImage";
import { Timestamp } from "./Timestamp";

export interface GroupMessage {
  id: string;
  text: string;
  sentAt: string;
  // Its author was banned: the text is gone and a placeholder is shown.
  banned?: boolean;
}

// What somebody wrote in a row, in a room or between two people: their name once, the time of the last message, and
// each message in a bubble of its own. What others say sits on the left with their avatar, what the guest says on the
// right; a moderator's words keep their green, bold look either way. With `onSelect` a click on a message chooses the
// person to write to; `nav` makes every message a stop for the arrow keys (see rowNavigation.ts).
export function MessageGroup({
  mine,
  nickname,
  role,
  avatar,
  messages,
  blocked = false,
  direct,
  onSelect,
  selectable = true,
  nav,
}: {
  mine: boolean;
  // Who the click chooses; in a private message that is the other person, not the author.
  nickname: string;
  role: Role;
  avatar: Avatar;
  messages: GroupMessage[];
  blocked?: boolean;
  // A private message among the room's: says who it is to or from, in place of the name.
  direct?: { label: string };
  onSelect?: () => void;
  // Whether they can be written to now (they are here and nobody has blocked anybody); if not, a click does nothing.
  selectable?: boolean;
  nav?: { stopId: string | null };
}) {
  const { t } = useTranslation();
  const moderator = role === "moderator";
  const last = messages[messages.length - 1];

  const bubble = (message: GroupMessage) => {
    const gif = message.banned ? null : gifOf(message.text);

    if (gif) {
      return direct ? (
        <div className="rounded-2xl border border-dashed border-amber-400/60 bg-amber-400/10 p-1">
          <GifImage url={gif} />
        </div>
      ) : (
        <GifImage url={gif} />
      );
    }

    return (
      /* Rendered as text, never as HTML. */
      <p
        className={`whitespace-pre-wrap wrap-anywhere rounded-2xl px-3 py-2 ${
          direct
            ? `border border-dashed border-amber-400/60 bg-amber-400/10 py-1 ${message.banned ? "font-semibold italic text-red-400" : ""}`
            : moderator
              ? "border border-green-500/40 bg-green-900/30 font-bold text-green-300"
              : mine
                ? "rounded-br-sm bg-indigo-600 text-white"
                : "rounded-bl-sm bg-slate-800"
        }`}
      >
        {message.banned ? t("room.bannedMessage") : message.text}
      </p>
    );
  };

  return (
    <li
      data-side={mine ? "right" : "left"}
      {...(direct ? { "data-kind": "direct" } : {})}
      className={`-mx-2 flex min-w-0 items-start gap-2 rounded-lg px-2 py-1 ${mine ? "flex-row-reverse" : ""}`}
    >
      {!mine && <AvatarIcon avatar={avatar} />}
      <div
        className={`flex min-w-0 max-w-[80%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-2 text-xs">
          <span
            className={
              direct
                ? "font-semibold text-amber-300"
                : moderator
                  ? "font-bold text-green-400"
                  : mine
                    ? "font-semibold text-indigo-300"
                    : "font-semibold"
            }
          >
            {direct ? direct.label : nickname}
          </span>
          {blocked && <BlockedTag />}
          {!direct && moderator && (
            <span className="rounded bg-green-500/20 px-1.5 py-0.5 font-semibold uppercase text-green-300">
              {t("room.moderatorBadge")}
            </span>
          )}
          <Timestamp sentAt={last.sentAt} className="text-slate-500" />
        </div>
        {messages.map((message) => {
          const stop = nav
            ? navStop(message.id, message.id === nav.stopId)
            : undefined;

          return onSelect ? (
            <div key={message.id} className="relative max-w-full">
              {bubble(message)}
              <button
                type="button"
                onClick={selectable ? onSelect : undefined}
                aria-disabled={selectable ? undefined : true}
                aria-label={t("person.message", { name: nickname })}
                {...stop}
                className={`absolute inset-0 rounded-2xl ${selectable ? "hover:bg-slate-100/5" : "cursor-not-allowed"} ${NAV_STOP_CLASS}`}
              />
            </div>
          ) : (
            <div
              key={message.id}
              {...stop}
              className={`max-w-full rounded-2xl ${stop ? NAV_STOP_CLASS : ""}`}
            >
              {bubble(message)}
            </div>
          );
        })}
      </div>
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
      <Timestamp sentAt={sentAt} className="text-slate-500" />
    </li>
  );
}
