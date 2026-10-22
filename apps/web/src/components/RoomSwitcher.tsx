import { MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDown, LogOut } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { Room } from "../api";
import { groupRooms, roomVars, type RoomGroup } from "../roomThemes";
import { HEADER_DROPDOWN, MENU_SURFACE } from "./dropdown";
import { RoomIcon } from "./RoomIcon";
import { ReloadMenu } from "./ReloadMenu";

const GROUP_LABELS = {
  admin: "room.groupAdmin",
  open: "room.groupOpen",
  topics: "room.groupTopics",
} as const satisfies Record<RoomGroup, string>;

// Tells when the list is opened, which a render prop is the way to know.
function WhenOpened({ open, onOpen }: { open: boolean; onOpen?: () => void }) {
  useEffect(() => {
    if (open) onOpen?.();
    // Only the opening counts, not a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return null;
}

// The room's name as the page's title, which is also how to move to another room.
export function RoomSwitcher({
  rooms,
  slug,
  name,
  disabled,
  onSelect,
  onLeave,
  onOpen,
}: {
  rooms: Room[];
  slug: string;
  name: string;
  disabled: boolean;
  onSelect: (room: Room) => void;
  onLeave: () => void;
  // Called when the list opens, to bring the numbers of people up to date.
  onOpen?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const groups = groupRooms(rooms, i18n.language);

  return (
    <h2 id="room-heading" className="min-w-0 text-xl font-semibold">
      <ReloadMenu name="rooms">
        {({ open }) => (
          <>
            <WhenOpened open={open} onOpen={onOpen} />
            <MenuButton className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 hover:bg-(--room-accent)/10 outline-none data-focus:outline-2 data-focus:outline-solid data-focus:outline-(--room-accent)">
              <RoomIcon slug={slug} />
              <span className="truncate">{name}</span>
              <ChevronDown
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-(--room-accent)"
              />
            </MenuButton>
            {/* At the page's left edge. The header is what the box is placed against, so the heading must not be positioned
            itself. */}
            <div className="absolute left-(--page-gutter) w-0">
              <MenuItems
                modal={false}
                className={`${HEADER_DROPDOWN} min-w-48 text-sm font-normal ${MENU_SURFACE}`}
              >
                {groups.map(({ group, rooms: inGroup }, index) => (
                  <div
                    key={group}
                    role="group"
                    aria-labelledby={`room-group-${group}`}
                    className={
                      index > 0 ? "mt-1 border-t border-neutral-800 pt-1" : ""
                    }
                  >
                    <div
                      id={`room-group-${group}`}
                      className="px-2 py-1 text-xs font-medium tracking-wide text-neutral-500 uppercase"
                    >
                      {t(GROUP_LABELS[group])}
                    </div>
                    {inGroup.map((room) => (
                      <MenuItem key={room.slug} disabled={disabled}>
                        <button
                          type="button"
                          onClick={() => {
                            if (room.slug !== slug) onSelect(room);
                          }}
                          aria-current={room.slug === slug ? "page" : undefined}
                          data-selected={room.slug === slug ? "" : undefined}
                          style={roomVars(room.slug)}
                          // The room you are in is tinted and ringed in its accent, which shows on the plain rooms too. The ring
                          // is inside the box, or the next room's hover would paint over its lower edge.
                          className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left data-focus:bg-neutral-800 data-disabled:cursor-default data-disabled:opacity-50 data-selected:bg-(--room-accent)/15 data-selected:font-medium data-selected:text-(--room-accent) data-selected:ring-1 data-selected:ring-inset data-selected:ring-(--room-accent)/40"
                        >
                          <RoomIcon slug={room.slug} className="h-4 w-4" />
                          <span className="flex-1">{room.name}</span>
                          {typeof room.memberCount === "number" && (
                            <span
                              aria-hidden="true"
                              className="pl-3 text-xs font-normal text-neutral-400 tabular-nums"
                            >
                              {typeof room.maxMembers === "number"
                                ? `${room.memberCount}/${room.maxMembers}`
                                : room.memberCount}
                            </span>
                          )}
                        </button>
                      </MenuItem>
                    ))}
                  </div>
                ))}
                <div className="mt-1 border-t border-neutral-800 pt-1">
                  <MenuItem>
                    <button
                      type="button"
                      onClick={onLeave}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-red-300 data-focus:bg-neutral-800"
                    >
                      <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
                      {t("room.leave")}
                    </button>
                  </MenuItem>
                </div>
              </MenuItems>
            </div>
          </>
        )}
      </ReloadMenu>
    </h2>
  );
}
