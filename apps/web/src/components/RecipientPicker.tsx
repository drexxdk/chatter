import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ChevronDown, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DirectThread, Partner } from "../chat/direct";
import { isTouchScreen } from "../touch";
import { AvatarIcon, GenderMark } from "./Avatar";
import { Button } from "./Button";
import { composerButton } from "./composerControls";
import { BlockedByTag, BlockedTag, ThreadSection } from "./DirectLists";
import { PANEL_SURFACE } from "./dropdown";
import { FocusSearch } from "./FocusSearch";
import { PeopleFilterChips, usePeopleFilter } from "./PeopleFilter";
import { SearchBox } from "./SearchBox";

// Who the message box writes to: everybody, or one person picked from a dropdown, as with the emoji button, that can
// be searched and narrowed down by what they chose as avatar, or to moderators. The same dropdown has the private
// conversations, which is also where a narrow screen finds them.
export function RecipientPicker({
  recipients,
  value,
  onChange,
  threads,
  onOpenThread,
  onSetMuted,
  blockedIds,
  blockedByIds,
  onSetBlocked,
}: {
  recipients: Partner[];
  value: Partner | null;
  onChange: (guestId: string | null) => void;
  threads: DirectThread[];
  onOpenThread: (partner: Partner) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  blockedIds: string[];
  // Whoever has blocked the guest is greyed out and cannot be chosen.
  blockedByIds: string[];
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const touch = isTouchScreen();
  const filter = usePeopleFilter(recipients);
  const { shown, filtering } = filter;
  const unread = threads.reduce((sum, thread) => sum + thread.unread, 0);

  const row = (selected: boolean) =>
    `flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-800 ${
      selected ? "bg-neutral-800 font-semibold" : ""
    }`;

  return (
    <Popover className="flex">
      <PopoverButton
        aria-label={`${t("dm.recipient")}: ${value?.nickname ?? t("dm.all")}${
          unread > 0 ? `, ${t("dm.unread", { count: unread })}` : ""
        }`}
        className={`${composerButton} relative w-28 shrink-0 gap-1.5 px-2 text-left sm:w-40`}
      >
        {value ? (
          <AvatarIcon avatar={value.avatar} picture={value.picture} small />
        ) : (
          <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {value?.nickname ?? t("dm.all")}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-0.5 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-neutral-950"
          >
            {unread}
          </span>
        )}
      </PopoverButton>

      <PopoverPanel
        role="dialog"
        aria-label={t("dm.recipient")}
        anchor={{ to: "top end", gap: 8, offset: 74, padding: 16 }}
        // As far right as the message box, like the emoji dropdown: past the emoji and send buttons beside this one.
        focus={!touch}
        className={`picker z-40 flex h-[36rem] w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 p-3 ${PANEL_SURFACE}`}
      >
        {({ close }) => {
          const choose = (guestId: string | null) => {
            onChange(guestId);
            close();
          };

          return (
            <>
              <FocusSearch />
              <SearchBox
                value={filter.query}
                onChange={filter.setQuery}
                label={t("dm.search")}
              />

              <PeopleFilterChips filter={filter} label={t("dm.filter")} />

              <div className="picker-list picker-people">
                <ul className="space-y-1">
                  {shown.map((person) => {
                    const blocked = blockedIds.includes(person.guestId);
                    const blockedBy = blockedByIds.includes(person.guestId);

                    return (
                      <li
                        key={person.guestId}
                        className="flex items-center gap-1"
                      >
                        <button
                          type="button"
                          disabled={blocked || blockedBy}
                          aria-current={value?.guestId === person.guestId}
                          onClick={() =>
                            choose(
                              value?.guestId === person.guestId
                                ? null
                                : person.guestId,
                            )
                          }
                          className={`${row(value?.guestId === person.guestId)} min-w-0 flex-1 disabled:opacity-60 disabled:hover:bg-transparent`}
                        >
                          <AvatarIcon
                            avatar={person.avatar}
                            picture={person.picture}
                            small
                          />
                          <span
                            className={
                              person.role === "moderator"
                                ? "truncate font-bold text-green-400"
                                : "truncate"
                            }
                          >
                            {person.nickname}
                          </span>
                          <GenderMark
                            avatar={person.avatar}
                            picture={person.picture}
                          />
                          {blocked && <BlockedTag />}
                          {blockedBy && <BlockedByTag />}
                        </button>
                        {blocked && (
                          <Button
                            variant="inline"
                            onClick={() => onSetBlocked(person.guestId, false)}
                            aria-label={t("dm.unblock", {
                              name: person.nickname,
                            })}
                            className="shrink-0"
                          >
                            {t("dm.unblockAction")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                  {filtering && shown.length === 0 && (
                    <li className="px-2 py-1.5 text-sm text-neutral-500">
                      {t("dm.noMatches")}
                    </li>
                  )}
                </ul>
              </div>

              <ThreadSection
                className="picker-threads"
                threads={threads}
                blockedIds={blockedIds}
                onOpen={(partner) => {
                  onOpenThread(partner);
                  close();
                }}
                onSetMuted={onSetMuted}
                onSetBlocked={onSetBlocked}
              />
            </>
          );
        }}
      </PopoverPanel>
    </Popover>
  );
}
