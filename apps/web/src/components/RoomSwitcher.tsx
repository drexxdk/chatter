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
    <h2 id="room-heading" className="relative min-w-0 text-xl font-semibold">
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
        {/* Fixed at its place in the header: a portal in the document, or an absolute box, makes the page scroll to the option. */}
        <ListboxOptions className="fixed z-50 mt-1 min-w-48 rounded-md border border-slate-700 bg-slate-900 p-1 text-sm font-normal shadow-lg focus:outline-none">
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
      </Listbox>
    </h2>
  );
}
