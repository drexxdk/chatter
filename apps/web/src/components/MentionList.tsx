import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import { AvatarIcon } from "./Avatar";
import { MENU_SURFACE } from "./dropdown";
import { IdentityName } from "./Identity";

// The people who could be meant by an "@" being written, in a list above the message box. The box keeps the focus: the
// highlighted one is what Enter or Tab chooses, and the arrow keys move it.
export function MentionList({
  id,
  people,
  active,
  onChoose,
  onHover,
}: {
  id: string;
  people: Partner[];
  active: number;
  onChoose: (person: Partner) => void;
  onHover: (index: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <ul
      id={id}
      role="listbox"
      aria-label={t("mentions.label")}
      className={`absolute bottom-full left-0 z-30 mb-2 max-h-[max(0px,min(16rem,calc(var(--composer-top,100dvh)-var(--header-height,0px)-1rem)))] w-72 max-w-full ${MENU_SURFACE}`}
    >
      {people.map((person, index) => (
        <li
          key={person.guestId}
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === active}
          // A click must not take the focus from the box, or the cursor would be lost.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(person)}
          onMouseMove={() => {
            if (index !== active) onHover(index);
          }}
          className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${
            index === active ? "bg-neutral-800" : ""
          }`}
        >
          <AvatarIcon
            avatar={person.avatar}
            picture={person.picture}
            small
            titled={false}
          />
          <IdentityName person={person} />
        </li>
      ))}
    </ul>
  );
}
