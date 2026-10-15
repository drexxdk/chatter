import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AVATARS, PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { AvatarIcon } from "./Avatar";

interface Person {
  nickname: string;
  avatar?: Avatar;
  role?: string;
}

// Narrowing a list of people by name, by the avatar they chose, or to moderators; the same in the dropdown of who the
// message box writes to and in the list of people beside the chat.
export function usePeopleFilter<T extends Person>(people: T[]) {
  const [query, setQuery] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [moderatorsOnly, setModeratorsOnly] = useState(false);

  const needle = query.trim().toLowerCase();
  const shown = people.filter(
    (person) =>
      person.nickname.toLowerCase().includes(needle) &&
      (avatars.length === 0 ||
        avatars.includes(person.avatar ?? PLAIN_AVATAR)) &&
      (!moderatorsOnly || person.role === "moderator"),
  );

  return {
    query,
    setQuery,
    avatars,
    toggleAvatar: (avatar: Avatar) =>
      setAvatars((current) =>
        current.includes(avatar)
          ? current.filter((candidate) => candidate !== avatar)
          : [...current, avatar],
      ),
    moderatorsOnly,
    toggleModerators: () => setModeratorsOnly((current) => !current),
    shown,
    filtering: needle !== "" || avatars.length > 0 || moderatorsOnly,
  };
}

export type PeopleFilter = ReturnType<typeof usePeopleFilter>;

const chip = (active: boolean) =>
  active
    ? "border-indigo-400 bg-indigo-500/30 text-white"
    : "border-neutral-700 text-neutral-300 hover:bg-neutral-800";

// The toggles of the filter: each avatar and the moderators. Compact, they are only the symbols (named for those who
// cannot see them), which is what fits beside the chat.
export function PeopleFilterChips({
  filter,
  label,
  compact = false,
}: {
  filter: PeopleFilter;
  label: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const shape = compact
    ? "grid h-8 min-w-8 flex-1 place-items-center rounded-md border"
    : "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm";
  const moderator = t("room.moderatorBadge");

  return (
    <div
      role="group"
      aria-label={label}
      className={compact ? "flex flex-wrap gap-1" : "grid grid-cols-2 gap-2"}
    >
      {AVATARS.map((avatar) => (
        <button
          key={avatar}
          type="button"
          aria-pressed={filter.avatars.includes(avatar)}
          aria-label={compact ? t(`avatar.${avatar}`) : undefined}
          title={compact ? t(`avatar.${avatar}`) : undefined}
          onClick={() => filter.toggleAvatar(avatar)}
          className={`${shape} ${chip(filter.avatars.includes(avatar))}`}
        >
          <AvatarIcon avatar={avatar} small titled={!compact} />
          {!compact && t(`avatar.${avatar}`)}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={filter.moderatorsOnly}
        aria-label={compact ? moderator : undefined}
        title={compact ? moderator : undefined}
        onClick={filter.toggleModerators}
        className={`${shape} ${chip(filter.moderatorsOnly)}`}
      >
        <ShieldCheck
          aria-hidden="true"
          className="h-6 w-6 shrink-0 rounded-full bg-green-500/20 p-1 text-green-300 ring-1 ring-green-400/60"
        />
        {!compact && moderator}
      </button>
    </div>
  );
}
