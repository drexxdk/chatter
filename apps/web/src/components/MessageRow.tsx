import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Avatar } from "../chat/avatar";
import { splitGif } from "../chat/gifs";
import type { Reaction } from "../chat/reactions";
import type { Role } from "../chat/useChat";
import { NAV_STOP_CLASS, navStop } from "../rowNavigation";
import { AvatarIcon } from "./Avatar";
import { BlockedTag } from "./DirectLists";
import { GifImage } from "./GifImage";
import { MessageEntry, type ReactionOptions } from "./MessageEntry";
import type { PersonMenuOptions } from "./PersonMenu";
import { Timestamp } from "./Timestamp";

export interface GroupMessage {
  id: string;
  text: string;
  sentAt: string;
  // Its author was banned: the text is gone and a placeholder is shown.
  banned?: boolean;
  reactions?: Reaction[];
}

// A drag across a message selects its text to copy; only a plain click chooses the person.
function chooseUnlessSelecting(choose: () => void) {
  if (!window.getSelection()?.toString()) choose();
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
  gone = false,
  direct,
  onSelect,
  selectable = true,
  nav,
  reactions,
  menu,
}: {
  mine: boolean;
  // Who the click chooses; in a private message that is the other person, not the author.
  nickname: string;
  role: Role;
  avatar: Avatar;
  messages: GroupMessage[];
  blocked?: boolean;
  // They have left the room; their messages stay, with a note and a dimmed avatar.
  gone?: boolean;
  // A private message among the room's: says who it is to or from, in place of the name.
  direct?: { label: string };
  onSelect?: () => void;
  // Whether they can be written to now (they are here and nobody has blocked anybody); if not, a click does nothing.
  selectable?: boolean;
  nav?: { stopId: string | null };
  // Lets the guest react to the messages; absent in private messages.
  reactions?: ReactionOptions;
  // What can be done with the person, from the "…" button of a message's hover bar.
  menu?: PersonMenuOptions;
}) {
  const { t } = useTranslation();
  const moderator = role === "moderator";
  const last = messages[messages.length - 1];

  const picture = (url: string) =>
    direct ? (
      <div className="rounded-2xl border border-dashed border-amber-400/60 bg-amber-400/10 p-1">
        <GifImage url={url} />
      </div>
    ) : (
      <GifImage url={url} />
    );

  const words = (text: string, banned?: boolean) => (
    /* Rendered as text, never as HTML. */
    <p
      className={`whitespace-pre-wrap wrap-anywhere rounded-2xl px-3 py-2 ${
        direct
          ? `border border-dashed border-amber-400/60 bg-amber-400/10 py-1 ${banned ? "font-semibold italic text-red-400" : ""}`
          : moderator
            ? "border border-green-500/40 bg-green-900/30 font-bold text-green-300"
            : mine
              ? "rounded-br-sm bg-indigo-600 text-white"
              : "rounded-bl-sm bg-slate-800"
      }`}
    >
      {banned ? t("room.bannedMessage") : text}
    </p>
  );

  // A message is words, a GIF, or words with a GIF after them.
  const bubble = (message: GroupMessage) => {
    if (message.banned) return words(message.text, true);

    const { text, gif } = splitGif(message.text);

    if (!gif) return words(message.text);
    if (!text) return picture(gif);

    return (
      <div
        className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
      >
        {words(text)}
        {picture(gif)}
      </div>
    );
  };
  return (
    <li
      data-side={mine ? "right" : "left"}
      {...(direct ? { "data-kind": "direct" } : {})}
      className={`@container -mx-2 flex min-w-0 items-start gap-2 rounded-lg px-2 py-1 ${mine ? "flex-row-reverse" : ""}`}
    >
      {!mine && <AvatarIcon avatar={avatar} dimmed={gone} />}
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
          {last && (
            <Timestamp sentAt={last.sentAt} className="text-slate-500" />
          )}
        </div>
        {messages.map((message) => {
          const stop = nav
            ? navStop(message.id, message.id === nav.stopId)
            : undefined;
          const reactable = reactions && !message.banned;
          const keyShortcut =
            reactable && !mine ? { "aria-keyshortcuts": "R" } : {};

          return (
            <MessageEntry
              key={message.id}
              id={message.id}
              mine={mine}
              reactions={reactable ? reactions : undefined}
              reacted={message.reactions ?? []}
              menu={message.banned ? undefined : menu}
            >
              {onSelect ? (
                // The click is taken here, not by the button, so the text stays selectable.
                <div
                  className="group/bubble relative max-w-full"
                  onClick={
                    selectable
                      ? () => chooseUnlessSelecting(onSelect)
                      : undefined
                  }
                >
                  {bubble(message)}
                  <button
                    type="button"
                    aria-disabled={selectable ? undefined : true}
                    aria-label={t("person.message", { name: nickname })}
                    {...stop}
                    {...keyShortcut}
                    className={`pointer-events-none absolute inset-0 rounded-2xl ${selectable ? "group-hover/bubble:bg-slate-100/5" : ""} ${NAV_STOP_CLASS}`}
                  />
                </div>
              ) : (
                <div
                  {...stop}
                  {...keyShortcut}
                  className={`max-w-full rounded-2xl ${stop ? NAV_STOP_CLASS : ""}`}
                >
                  {bubble(message)}
                </div>
              )}
            </MessageEntry>
          );
        })}
        {/* After the messages, not beside the time: that is when the message was sent, not when they left. */}
        {gone && (
          <p className="flex items-center gap-1 text-xs italic text-slate-400">
            <LogOut aria-hidden="true" className="h-3 w-3" />
            {t("room.leftTag")}
          </p>
        )}
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
