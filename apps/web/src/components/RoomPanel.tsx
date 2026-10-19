import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Popover,
  PopoverButton,
  PopoverPanel,
  useClose,
} from "@headlessui/react";
import { ChevronDown, Users } from "lucide-react";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import type { DirectApi, Member } from "../chat/useChat";
import { PeopleList, ThreadSection } from "./DirectLists";
import { PeopleFilterChips, usePeopleFilter } from "./PeopleFilter";
import { SearchBox } from "./SearchBox";
import { FocusSearch } from "./FocusSearch";

function CloseOnWideScreen() {
  const close = useClose();
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const wide = matchMedia("(min-width: 48rem)");
    const dismiss = () => {
      if (wide.matches) close();
    };
    dismiss();
    wide.addEventListener("change", dismiss);
    return () => wide.removeEventListener("change", dismiss);
  }, [close]);
  return null;
}

export function RoomPanelDropdown({
  unread,
  ...props
}: ComponentProps<typeof RoomPanel> & { unread: number }) {
  const { t } = useTranslation();
  return (
    <Popover className="shrink-0 md:hidden">
      {({ close }) => (
        <>
          <PopoverPanel
            id="room-panel-sheet"
            role="region"
            aria-label={t("room.panel")}
            focus
            className="sheet absolute inset-x-0 bottom-full z-10 mb-0 h-[calc(100dvh-var(--header-height)-100%-0.5rem)] overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 p-3 shadow-lg md:hidden"
          >
            <CloseOnWideScreen />
            <FocusSearch />
            <RoomPanel
              {...props}
              onSelect={(partner) => {
                close();
                props.onSelect(partner);
              }}
              onOpen={(partner) => {
                close();
                props.onOpen(partner);
              }}
            />
          </PopoverPanel>
          <PopoverButton
            id="room-panel-toggle"
            title={t("room.panel")}
            aria-label={`${t("room.panel")}${unread > 0 ? `, ${t("dm.unread", { count: unread })}` : ""}`}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-300 outline-none hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-indigo-400 aria-expanded:bg-neutral-800 aria-expanded:text-neutral-100"
          >
            <Users aria-hidden="true" className="h-5 w-5" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1.5 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-neutral-950"
              >
                {unread}
              </span>
            )}
          </PopoverButton>
        </>
      )}
    </Popover>
  );
}

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
        <DisclosureButton className="group flex h-7 w-full items-center justify-between gap-2 rounded text-left text-sm font-semibold text-neutral-300 outline-none hover:text-neutral-100 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400">
          {title}
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 group-data-open:rotate-180"
          />
        </DisclosureButton>
      </h3>
      <DisclosurePanel
        transition
        className="-mx-1 -mb-1 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1 pt-2 pb-1 transition-opacity duration-200 data-closed:opacity-0"
      >
        {children}
      </DisclosurePanel>
    </Disclosure>
  );
}

// The people in the room and the private conversations: a sidebar on wide screens.
export function RoomPanel({
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
  const filter = usePeopleFilter(members);
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
            ? t("room.membersOfMax", { count: members.length, max: maxMembers })
            : t("room.members", { count: members.length })
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
