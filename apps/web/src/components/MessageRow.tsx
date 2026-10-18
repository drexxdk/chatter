import { LogOut } from "lucide-react";
import clsx from "clsx";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import type { Avatar } from "../chat/avatar";
import { messageParts } from "../chat/gifs";
import type { Reaction } from "../chat/reactions";
import type { Role } from "../chat/useChat";
import { NAV_STOP_CLASS, navStop } from "../rowNavigation";
import { AvatarIcon, GenderMark } from "./Avatar";
import { BlockedTag } from "./DirectLists";
import { GifImage } from "./GifImage";
import { MessageEntry, type ReactionOptions } from "./MessageEntry";
import { MentionedText } from "./Mentions";
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

// What somebody wrote in a row, in a room or between two people: their name once, the time of the last message, and
// each message in a bubble of its own. What others say sits on the left with their avatar, what the guest says on the
// right; a moderator's words keep their green, bold look either way. With `onSelect` a click on the name or the avatar
// chooses the person to write to (from the keyboard, Enter on a message does); `nav` makes every message a stop for the
// arrow keys (see rowNavigation.ts).
function MessageGroupView({
  mine,
  nickname,
  role,
  avatar,
  picture,
  messages,
  blocked = false,
  gone = false,
  direct,
  onSelect,
  onSeen,
  selectable = true,
  nav,
  reactions,
  menu,
  onReport,
}: {
  mine: boolean;
  // Who the click chooses; in a private message that is the other person, not the author.
  nickname: string;
  role: Role;
  avatar: Avatar;
  // The picture of an account, shown where a guest has their avatar's symbol (which then goes beside the name).
  picture?: string;
  messages: GroupMessage[];
  blocked?: boolean;
  // They have left the room; their messages stay, with a note and a dimmed avatar.
  gone?: boolean;
  // A private message among the room's: says who it is to or from, in place of the name.
  direct?: { label: string };
  onSelect?: () => void;
  // The guest has looked at this person's messages (by clicking them or the name or avatar): whatever was new in what
  // they wrote is not any more.
  onSeen?: () => void;
  // Whether they can be written to now (they are here and nobody has blocked anybody); if not, a click does nothing.
  selectable?: boolean;
  nav?: { stopId: string | null };
  // Lets the guest react to the messages.
  reactions?: ReactionOptions;
  // What can be done with the person, from the "…" button of a message's hover bar.
  menu?: PersonMenuOptions;
  // Reports one of the messages, from the same menu. Absent where they cannot be reported.
  onReport?: (messageId: string) => void;
}) {
  const { t } = useTranslation();
  const moderator = role === "moderator";
  const last = messages[messages.length - 1];
  // What the name and the avatar do when clicked: choosing the person (not for somebody who cannot be written to now)
  // and, always, having seen what they wrote. Only the first looks like something that can be clicked.
  const pick = onSelect && selectable ? onSelect : undefined;
  const clickPerson =
    onSeen || pick
      ? () => {
          onSeen?.();
          pick?.();
        }
      : undefined;

  const gifBubble = (url: string) =>
    direct ? (
      <div className="rounded-2xl border border-dashed border-amber-400/60 bg-amber-400/10 p-1">
        <GifImage url={url} />
      </div>
    ) : (
      <GifImage url={url} />
    );

  const bubbleStyle = direct
    ? "border border-dashed border-amber-400/60 bg-amber-400/10"
    : moderator
      ? "border border-green-500/40 bg-green-900/30 font-bold text-green-300"
      : mine
        ? "rounded-br-sm bg-sent text-white"
        : "rounded-bl-sm bg-neutral-800";

  const words = (text: string, banned?: boolean) => (
    /* Rendered as text, never as HTML. */
    <p
      className={clsx(
        "whitespace-pre-wrap wrap-anywhere rounded-2xl px-3 py-2",
        bubbleStyle,
        direct && "py-1",
        direct && banned && "font-semibold italic text-red-400",
      )}
    >
      {banned ? (
        t("room.bannedMessage")
      ) : (
        <MentionedText text={text} onDark={mine} />
      )}
    </p>
  );

  const bubble = (message: GroupMessage) => {
    if (message.banned) return words(message.text, true);

    const parts = messageParts(message.text);

    if (!parts.some((part) => part.gif)) return words(message.text);
    const single = parts.length === 1 ? parts[0] : undefined;
    if (single?.gif) return gifBubble(single.gif);

    return (
      <div
        className={clsx(
          "flex max-w-full flex-col items-start gap-1 rounded-2xl p-1",
          bubbleStyle,
        )}
      >
        {parts.map((part, index) =>
          part.gif ? (
            <GifImage key={index} url={part.gif} />
          ) : part.text.trim() ? (
            <p
              key={index}
              className="max-w-full whitespace-pre-wrap wrap-anywhere px-2 py-1"
            >
              <MentionedText text={part.text} onDark={mine} />
            </p>
          ) : null,
        )}
      </div>
    );
  };
  return (
    <li
      data-side={mine ? "right" : "left"}
      {...(direct ? { "data-kind": "direct" } : {})}
      className={clsx(
        "@container -mx-2 flex min-w-0 items-start gap-2 rounded-lg px-2 py-1",
        mine && "flex-row-reverse",
      )}
    >
      {!mine && (
        <span
          onClick={clickPerson}
          className={clsx("flex shrink-0", pick && "cursor-pointer")}
        >
          <AvatarIcon avatar={avatar} picture={picture} dimmed={gone} />
        </span>
      )}
      <div
        className={clsx(
          "flex min-w-0 max-w-[80%] flex-col gap-1",
          mine ? "items-end" : "items-start",
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          {/* What the guest wrote needs no name, as in Teams; a private message still says who it is to. */}
          {(!mine || direct) && (
            <span
              onClick={mine ? undefined : clickPerson}
              className={`${
                direct
                  ? "font-semibold text-amber-300"
                  : moderator
                    ? "font-bold text-green-400"
                    : "font-semibold"
              } ${pick && !mine ? "cursor-pointer hover:underline" : ""}`}
            >
              {direct ? direct.label : nickname}
            </span>
          )}
          {(!mine || direct) && (
            <GenderMark avatar={avatar} picture={picture} />
          )}
          {blocked && <BlockedTag />}
          {!direct && moderator && (
            <span className="rounded bg-green-500/20 px-1.5 py-0.5 font-semibold uppercase text-green-300">
              {t("room.moderatorBadge")}
            </span>
          )}
          {last && (
            <Timestamp sentAt={last.sentAt} className="text-neutral-500" />
          )}
        </div>
        {messages.map((message) => {
          const stop = nav
            ? navStop(message.id, message.id === nav.stopId)
            : undefined;
          const reactable = reactions && !message.banned;
          const hasGif =
            !message.banned &&
            messageParts(message.text).some((part) => part.gif);
          const shortcuts = [
            ...(reactable && !mine ? ["R"] : []),
            ...(hasGif ? ["P"] : []),
          ];
          const keyShortcut =
            shortcuts.length > 0
              ? { "aria-keyshortcuts": shortcuts.join(" ") }
              : {};

          return (
            <MessageEntry
              key={message.id}
              id={message.id}
              mine={mine}
              reactions={reactable ? reactions : undefined}
              reacted={message.reactions ?? []}
              menu={message.banned ? undefined : menu}
              onReport={
                onReport && !mine ? () => onReport(message.id) : undefined
              }
            >
              <div
                {...stop}
                {...keyShortcut}
                onClick={onSeen}
                className={clsx(
                  "max-w-full rounded-2xl",
                  stop && NAV_STOP_CLASS,
                )}
              >
                {bubble(message)}
              </div>
            </MessageEntry>
          );
        })}
        {/* After the messages, not beside the time: that is when the message was sent, not when they left. */}
        {gone && (
          <p className="flex items-center gap-1 text-xs italic text-neutral-400">
            <LogOut aria-hidden="true" className="h-3 w-3" />
            {t("room.leftTag")}
          </p>
        )}
      </div>
    </li>
  );
}
// Whether two things are the same as far as what is drawn goes: functions are not compared (see ChatRoom, which gives
// the rows ones that always do the current thing), everything else is, down to the last field.
function sameLook(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "function" && typeof b === "function") return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keys = Object.keys(a);

  if (keys.length !== Object.keys(b).length) return false;

  return keys.every(
    (key) =>
      key in b &&
      sameLook(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}

// A group is only drawn again when something about it changed: a busy room would otherwise draw every message again for
// each new one.
export const MessageGroup = memo(MessageGroupView, sameLook);

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
      <Timestamp sentAt={sentAt} className="text-neutral-500" />
    </li>
  );
}
