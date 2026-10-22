import { ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { useTabText } from "../tabDraft";
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
export function usePeopleFilter<T extends Person>(
  people: T[],
  draftKey?: string,
) {
  const [query, setQuery] = useTabText(draftKey ?? null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [moderatorsOnly, setModeratorsOnly] = useState(false);
  const counts: Record<Avatar, number> = {
    male: 0,
    female: 0,
    trans: 0,
    other: 0,
  };
  let moderatorCount = 0;
  for (const person of people) {
    if (person.role === "moderator") moderatorCount += 1;
    else counts[person.avatar ?? PLAIN_AVATAR] += 1;
  }
  const availableAvatars = avatars.filter((avatar) => counts[avatar] > 0);
  if (availableAvatars.length !== avatars.length) setAvatars(availableAvatars);
  if (moderatorsOnly && moderatorCount === 0) setModeratorsOnly(false);

  const needle = query.trim().toLowerCase();
  const shown = people.filter(
    (person) =>
      person.nickname.toLowerCase().includes(needle) &&
      ((avatars.length === 0 && !moderatorsOnly) ||
        (person.role === "moderator"
          ? moderatorsOnly
          : avatars.includes(person.avatar ?? PLAIN_AVATAR))),
  );

  return {
    query,
    setQuery,
    counts,
    moderatorCount,
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
    : "border-neutral-700 text-neutral-300 enabled:hover:bg-neutral-800 disabled:opacity-40";

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
  const countId = useId();
  const shape = compact
    ? "grid h-14 min-w-0 grid-rows-[1.5rem_1rem] content-center justify-items-center gap-1 rounded-md border px-1 [&>[data-avatar]]:size-5"
    : "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm";
  const moderator = t("room.moderatorBadge");

  return (
    <div
      role="group"
      aria-label={label}
      className={
        compact
          ? "grid auto-cols-fr grid-flow-col gap-1"
          : "grid grid-cols-2 gap-2"
      }
    >
      {AVATARS.map((avatar) => (
        <button
          key={avatar}
          type="button"
          aria-pressed={filter.avatars.includes(avatar)}
          aria-label={compact ? t(`avatar.${avatar}`) : undefined}
          aria-describedby={
            filter.counts[avatar] > 0 ? `${countId}-${avatar}` : undefined
          }
          title={compact ? t(`avatar.${avatar}`) : undefined}
          disabled={filter.counts[avatar] === 0}
          onClick={() => filter.toggleAvatar(avatar)}
          className={`${shape} ${chip(filter.avatars.includes(avatar))}`}
        >
          <AvatarIcon avatar={avatar} small titled={!compact} />
          {!compact && t(`avatar.${avatar}`)}
          {filter.counts[avatar] > 0 && (
            <span id={`${countId}-${avatar}`} className="text-xs tabular-nums">
              {filter.counts[avatar]}
            </span>
          )}
        </button>
      ))}
      {filter.moderatorCount > 0 && (
        <button
          type="button"
          aria-pressed={filter.moderatorsOnly}
          aria-label={compact ? moderator : undefined}
          aria-describedby={`${countId}-moderators`}
          title={compact ? moderator : undefined}
          onClick={filter.toggleModerators}
          className={`${shape} ${chip(filter.moderatorsOnly)}`}
        >
          <ShieldCheck
            aria-hidden="true"
            className="h-5 w-5 shrink-0 self-center text-green-300"
          />
          {!compact && moderator}
          <span id={`${countId}-moderators`} className="text-xs tabular-nums">
            {filter.moderatorCount}
          </span>
        </button>
      )}
    </div>
  );
}
