import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Room } from "../api";
import { groupRooms, roomTheme, roomVars } from "../roomThemes";
import { HEADER_DROPDOWN, MENU_SURFACE } from "./dropdown";

// The room's name as the page's title, which is also how to move to another room.
export function RoomSwitcher({
  rooms,
  slug,
  name,
  disabled,
  onSelect,
}: {
  rooms: Room[];
  slug: string;
  name: string;
  disabled: boolean;
  onSelect: (room: Room) => void;
}) {
  const { t, i18n } = useTranslation();
  const Icon = roomTheme(slug).icon;
  const groups = groupRooms(rooms, i18n.language);

  return (
    <h2 id="room-heading" className="min-w-0 text-xl font-semibold">
      <Listbox
        value={slug}
        disabled={disabled || rooms.length < 2}
        onChange={(next: string) => {
          const room = rooms.find((candidate) => candidate.slug === next);
          if (room && room.slug !== slug) onSelect(room);
        }}
      >
        <ListboxButton className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 hover:bg-neutral-800 outline-none data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400 disabled:hover:bg-transparent">
          <span style={roomVars(slug)} className="contents">
            <Icon
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-(--room-accent)"
            />
          </span>
          <span className="truncate">{name}</span>
          {rooms.length > 1 && (
            <ChevronDown
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-neutral-400"
            />
          )}
        </ListboxButton>
        {/* At the page's left edge. The header is what the box is placed against, so the heading must not be positioned
            itself. */}
        <div className="absolute left-(--page-gutter) w-0">
          <ListboxOptions
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
                  {t(group === "open" ? "room.groupOpen" : "room.groupTopics")}
                </div>
                {inGroup.map((room) => {
                  const RoomIcon = roomTheme(room.slug).icon;

                  return (
                    <ListboxOption
                      key={room.slug}
                      value={room.slug}
                      style={roomVars(room.slug)}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 data-focus:bg-neutral-800"
                    >
                      <RoomIcon
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-(--room-accent)"
                      />
                      <span className="flex-1">{room.name}</span>
                      <Check
                        aria-hidden="true"
                        className={`h-4 w-4 text-indigo-300 ${room.slug === slug ? "" : "invisible"}`}
                      />
                    </ListboxOption>
                  );
                })}
              </div>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </h2>
  );
}
