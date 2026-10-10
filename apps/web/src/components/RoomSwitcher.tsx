import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";

import type { Room } from "../api";

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
        <ListboxButton className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-800 outline-none data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400 disabled:hover:bg-transparent">
          <span className="truncate">{name}</span>
          {rooms.length > 1 && (
            <ChevronDown
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-slate-400"
            />
          )}
        </ListboxButton>
        {/* Fixed at the page's left edge, just below the header's button (2.875rem is where its 2.25rem button ends in the
            3.5rem header), and as tall as the room down to the message box's bottom edge. The header is what the box beside
            it is placed against, so the heading must not be positioned itself; a portal in the document would make the
            page scroll to the option. */}
        <div className="absolute left-0 w-0">
          <ListboxOptions className="fixed top-[2.875rem] z-50 mt-1 max-h-[calc(100dvh-3.875rem)] min-w-48 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 p-1 text-sm font-normal shadow-lg [color-scheme:dark] focus:outline-none">
            {rooms.map((room) => (
              <ListboxOption
                key={room.slug}
                value={room.slug}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 data-focus:bg-slate-800"
              >
                <span className="flex-1">{room.name}</span>
                <Check
                  aria-hidden="true"
                  className={`h-4 w-4 text-indigo-300 ${room.slug === slug ? "" : "invisible"}`}
                />
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </h2>
  );
}
