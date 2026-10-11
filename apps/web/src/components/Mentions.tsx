import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PLAIN_AVATAR } from "../chat/avatar";
import { splitMentions } from "../chat/mentions";
import type { Member } from "../chat/types";
import { AvatarIcon } from "./Avatar";

export interface MentionsValue {
  // Who is in the room: only they are known well enough to be shown as mentioned.
  people: Member[];
  selfGuestId: string;
  // Whether the person can be written to now.
  canWriteTo: (guestId: string) => boolean;
  onSelect: (person: Member) => void;
}

const MentionsContext = createContext<MentionsValue | null>(null);

export const MentionsProvider = MentionsContext.Provider;

function Card({ person }: { person: Member }) {
  const { t } = useTranslation();
  const avatar = person.avatar ?? PLAIN_AVATAR;

  return (
    <span className="flex items-center gap-2">
      <AvatarIcon avatar={avatar} small titled={false} />
      <span className="min-w-0">
        <span
          className={`block truncate font-semibold ${person.role === "moderator" ? "text-green-400" : ""}`}
        >
          {person.nickname}
        </span>
        <span className="block text-xs text-neutral-400">
          {t(`avatar.${avatar}`)}
          {person.age !== undefined && (
            <> &middot; {t("profile.years", { count: person.age })}</>
          )}
        </span>
      </span>
    </span>
  );
}

// A mention in a message, as in Teams: the name alone, in a colour of its own with nothing around it, with a card about
// the person while it is hovered, and a click that chooses them to write to privately. It is a stop for the mouse only;
// the keyboard chooses a person from their message.
function Mention({
  person,
  text,
  onDark,
  value,
}: {
  person: Member;
  text: string;
  onDark: boolean;
  value: MentionsValue;
}) {
  const [open, setOpen] = useState(false);
  // Below the name, where the message's own hover bar is not; above it, or to the side, when there is no room.
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context),
    useDismiss(context),
    useRole(context, { role: "tooltip" }),
  ]);
  const writable =
    person.guestId !== value.selfGuestId && value.canWriteTo(person.guestId);
  const className = onDark ? "text-indigo-300" : "text-indigo-400";
  // The "@" is how it was typed; what is read is the name.
  const name = text.slice(1);

  return (
    <>
      {writable ? (
        <button
          ref={refs.setReference}
          type="button"
          tabIndex={-1}
          data-mention={person.guestId}
          className={`${className} cursor-pointer hover:underline`}
          {...getReferenceProps({ onClick: () => value.onSelect(person) })}
        >
          {name}
        </button>
      ) : (
        <span
          ref={refs.setReference}
          data-mention={person.guestId}
          className={className}
          {...getReferenceProps()}
        >
          {name}
        </span>
      )}
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="pointer-events-none z-50 w-56 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-100 shadow-lg"
            {...getFloatingProps()}
          >
            <Card person={person} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
// A message's words, with the names of people in the room set apart. Outside a room (a private conversation, where there
// is nobody to mention) it is the text as it is.
export function MentionedText({
  text,
  onDark = false,
}: {
  text: string;
  // On a bubble of a strong colour, where the usual one would not show.
  onDark?: boolean;
}): ReactNode {
  const value = useContext(MentionsContext);

  if (!value || !text.includes("@")) return text;

  const pieces = splitMentions(text, value.people);
  if (pieces.every((piece) => typeof piece === "string")) return text;

  return pieces.map((piece, index) =>
    typeof piece === "string" ? (
      piece
    ) : (
      <Mention
        key={index}
        person={piece.mention}
        text={piece.text}
        onDark={onDark}
        value={value}
      />
    ),
  );
}
