import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import type { DirectApi, Member } from "../chat/useChat";
import { PeopleList, ThreadSection } from "./DirectLists";
import { PeopleFilterChips, usePeopleFilter } from "./PeopleFilter";
import { SearchBox } from "./SearchBox";

// The people in the room and the private conversations: a sidebar on wide screens.
export function RoomPanel({
  members,
  maxMembers,
  selfGuestId,
  selectedId,
  threads,
  onSelect,
  onOpen,
  notify,
  onNotifyChange,
  onSetMuted,
  blockedIds,
  blockedByIds,
  onSetBlocked,
}: {
  members: Member[];
  // Absent or null means the room has no limit.
  maxMembers?: number | null;
  selfGuestId: string;
  // Who the message box writes to privately now, if anybody.
  selectedId?: string | null;
  threads: DirectApi["threads"];
  onSelect: (partner: Partner) => void;
  onOpen: (partner: Partner) => void;
  notify: boolean;
  onNotifyChange: (notify: boolean) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  blockedIds: string[];
  blockedByIds: string[];
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const filter = usePeopleFilter(members);

  return (
    <div className="flex h-full flex-col gap-5">
      <section className="panel-people">
        <h3 className="text-sm font-semibold text-neutral-300">
          {typeof maxMembers === "number"
            ? t("room.membersOfMax", { count: members.length, max: maxMembers })
            : t("room.members", { count: members.length })}
        </h3>
        <SearchBox
          value={filter.query}
          onChange={filter.setQuery}
          label={t("dm.search")}
        />
        <PeopleFilterChips filter={filter} label={t("dm.filter")} compact />
        <div className="panel-list">
          <PeopleList
            members={filter.shown}
            selfGuestId={selfGuestId}
            selectedId={selectedId}
            blockedIds={blockedIds}
            blockedByIds={blockedByIds}
            onSelect={onSelect}
            onOpen={onOpen}
          />
          {filter.filtering && filter.shown.length === 0 && (
            <p className="text-sm text-neutral-500">{t("dm.noMatches")}</p>
          )}
        </div>
      </section>

      <ThreadSection
        className="panel-threads"
        threads={threads}
        notify={notify}
        blockedIds={blockedIds}
        onNotifyChange={onNotifyChange}
        onOpen={onOpen}
        onSetMuted={onSetMuted}
        onSetBlocked={onSetBlocked}
      />
    </div>
  );
}
