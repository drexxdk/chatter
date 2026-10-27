import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import type { DirectApi, Member } from "../chat/useChat";
import { PeopleList, ThreadSection } from "./DirectLists";
import { PeopleFilterChips, usePeopleFilter } from "./PeopleFilter";
import { SearchBox } from "./SearchBox";

// One part of the panel, which opens and closes. The open ones share the height of the panel equally (see `panel-section`
// in index.css), and the closed ones are only their heading.
function PanelSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Disclosure as="section" defaultOpen className="panel-section">
      <h3>
        <DisclosureButton className="group flex h-8 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm font-semibold text-neutral-300 outline-none -outline-offset-2 hover:bg-neutral-800 hover:text-neutral-100 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400">
          {title}
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 group-data-open:rotate-180"
          />
        </DisclosureButton>
      </h3>
      <DisclosurePanel
        transition
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-2 transition-opacity duration-200 data-closed:opacity-0"
      >
        {children}
      </DisclosurePanel>
    </Disclosure>
  );
}

// The people in the room and the private conversations: a sidebar on wide screens.
export function RoomPanel({
  roomSlug,
  members,
  maxMembers,
  selfGuestId,
  selectedId,
  threads,
  onSelect,
  onOpen,
  onSetMuted,
  blockedIds,
  blockedByIds,
  onSetBlocked,
}: {
  roomSlug?: string;
  members: Member[];
  // Absent or null means the room has no limit.
  maxMembers?: number | null;
  selfGuestId: string;
  // Who the message box writes to privately now, if anybody.
  selectedId?: string | null;
  threads: DirectApi["threads"];
  onSelect: (partner: Partner) => void;
  onOpen: (partner: Partner) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  blockedIds: string[];
  blockedByIds: string[];
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const filter = usePeopleFilter(
    members,
    roomSlug ? `people:${roomSlug}` : undefined,
  );
  const participantCount = members.filter(
    (member) => member.role !== "moderator",
  ).length;
  // The search is for the conversations too: by who they are with.
  const needle = filter.query.trim().toLowerCase();
  const shownThreads = threads.filter((thread) =>
    thread.nickname.toLowerCase().includes(needle),
  );

  return (
    <div className="flex h-full flex-col gap-5">
      <SearchBox
        value={filter.query}
        onChange={filter.setQuery}
        label={t("dm.search")}
      />

      <PanelSection
        title={
          typeof maxMembers === "number"
            ? t("room.membersOfMax", {
                count: participantCount,
                max: maxMembers,
              })
            : t("room.members", { count: participantCount })
        }
      >
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
      </PanelSection>

      <PanelSection title={t("dm.heading")}>
        <ThreadSection
          className="min-h-0 flex-1"
          showHeading={false}
          threads={shownThreads}
          searching={needle !== ""}
          blockedIds={blockedIds}
          onOpen={onOpen}
          onSetMuted={onSetMuted}
          onSetBlocked={onSetBlocked}
        />
      </PanelSection>
    </div>
  );
}
