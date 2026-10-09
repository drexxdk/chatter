import { ChevronDown, Search, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AVATARS, type Avatar } from "../chat/avatar";
import type { DirectThread, Partner } from "../chat/direct";
import { AvatarIcon } from "./Avatar";
import { ThreadList } from "./DirectLists";
import { SideDrawer } from "./SideDrawer";

const chip = (active: boolean) =>
  `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
    active
      ? "border-indigo-400 bg-indigo-500/30 text-white"
      : "border-slate-700 text-slate-300 hover:bg-slate-800"
  }`;

// Who the message box writes to: everybody, or one person picked from a slide-out list that can be searched and
// narrowed down by what they chose as avatar, or to moderators. The same slide-out has the private conversations,
// which is also where a narrow screen finds them.
export function RecipientPicker({
  recipients,
  value,
  onChange,
  threads,
  onOpenThread,
  showMovements,
  onShowMovementsChange,
}: {
  recipients: Partner[];
  value: Partner | null;
  onChange: (guestId: string | null) => void;
  threads: DirectThread[];
  onOpenThread: (partner: Partner) => void;
  showMovements: boolean;
  onShowMovementsChange: (show: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [moderatorsOnly, setModeratorsOnly] = useState(false);
  const unread = threads.reduce((sum, thread) => sum + thread.unread, 0);

  const needle = query.trim().toLowerCase();
  const shown = recipients.filter(
    (person) =>
      person.nickname.toLowerCase().includes(needle) &&
      (avatars.length === 0 || avatars.includes(person.avatar)) &&
      (!moderatorsOnly || person.role === "moderator"),
  );
  const filtering = needle !== "" || avatars.length > 0 || moderatorsOnly;

  function choose(guestId: string | null) {
    onChange(guestId);
    setOpen(false);
  }

  function toggleAvatar(avatar: Avatar) {
    setAvatars((current) =>
      current.includes(avatar)
        ? current.filter((candidate) => candidate !== avatar)
        : [...current, avatar],
    );
  }

  const row = (selected: boolean) =>
    `flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-800 ${
      selected ? "bg-slate-800 font-semibold" : ""
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("dm.recipient")}: ${value?.nickname ?? t("dm.all")}`}
        className="relative flex w-28 shrink-0 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-left sm:w-40"
      >
        {value ? (
          <AvatarIcon avatar={value.avatar} small />
        ) : (
          <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {value?.nickname ?? t("dm.all")}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-slate-400"
        />
        {unread > 0 && (
          <>
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-950"
            >
              {unread}
            </span>
            <span className="sr-only">{t("dm.unread", { count: unread })}</span>
          </>
        )}
      </button>

      <SideDrawer
        open={open}
        title={t("dm.recipient")}
        side="left"
        onClose={() => setOpen(false)}
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("dm.search")}
            placeholder={t("dm.search")}
            autoComplete="off"
            className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-8 pr-2 text-sm"
          />
        </div>

        <div
          role="group"
          aria-label={t("dm.filter")}
          className="flex flex-wrap gap-2"
        >
          {AVATARS.map((avatar) => (
            <button
              key={avatar}
              type="button"
              aria-pressed={avatars.includes(avatar)}
              onClick={() => toggleAvatar(avatar)}
              className={chip(avatars.includes(avatar))}
            >
              <AvatarIcon avatar={avatar} small />
              {t(`avatar.${avatar}`)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={moderatorsOnly}
            onClick={() => setModeratorsOnly((current) => !current)}
            className={chip(moderatorsOnly)}
          >
            {t("room.moderatorBadge")}
          </button>
        </div>

        <ul className="space-y-1">
          <li>
            <button
              type="button"
              aria-current={value === null}
              onClick={() => choose(null)}
              className={row(value === null)}
            >
              <Users aria-hidden="true" className="h-6 w-6 p-1" />
              {t("dm.all")}
            </button>
          </li>
          {shown.map((person) => (
            <li key={person.guestId}>
              <button
                type="button"
                aria-current={value?.guestId === person.guestId}
                onClick={() => choose(person.guestId)}
                className={row(value?.guestId === person.guestId)}
              >
                <AvatarIcon avatar={person.avatar} small />
                <span
                  className={
                    person.role === "moderator"
                      ? "font-bold text-green-400"
                      : undefined
                  }
                >
                  {person.nickname}
                </span>
              </button>
            </li>
          ))}
          {filtering && shown.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-slate-500">
              {t("dm.noMatches")}
            </li>
          )}
        </ul>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">
            {t("dm.heading")}
          </h3>
          <ThreadList
            threads={threads}
            onOpen={(partner) => {
              onOpenThread(partner);
              setOpen(false);
            }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300 md:hidden">
          <input
            type="checkbox"
            checked={showMovements}
            onChange={(event) => onShowMovementsChange(event.target.checked)}
          />
          {t("room.showMovements")}
        </label>
      </SideDrawer>
    </>
  );
}
