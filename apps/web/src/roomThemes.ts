import {
  Cpu,
  Dices,
  Gamepad2,
  Hash,
  Heart,
  MessageCircle,
  Music,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

import type { Room } from "./api";

// The rooms are in two groups: the ones that are open to anything, and the ones about something.
export type RoomGroup = "open" | "topics";

export interface RoomTheme {
  group: RoomGroup;
  icon: LucideIcon;
  // The colours of the room, dark enough for the page's text to be read on them: the header's background, the border
  // round it and round the room's card, the card's background, and the lighter colour of the icon.
  tint: string;
  border: string;
  card: string;
  accent: string;
}

// Rooms without a colour of their own have the page's greys.
const PLAIN = {
  tint: "var(--color-neutral-950)",
  border: "var(--color-neutral-800)",
  card: "var(--color-neutral-900)",
  accent: "var(--color-neutral-300)",
};

// By the room's address, which is what stays the same when its name is changed. A room made later has the plain look until
// it is given one here.
const THEMES: Record<string, RoomTheme> = {
  general: { group: "open", icon: MessageCircle, ...PLAIN },
  random: { group: "open", icon: Dices, ...PLAIN },
  dating: {
    group: "topics",
    icon: Heart,
    tint: "#2e1420",
    border: "#6b2a47",
    card: "#260f19",
    accent: "#fb7185",
  },
  music: {
    group: "topics",
    icon: Music,
    tint: "#2b1531",
    border: "#5e2a6b",
    card: "#241229",
    accent: "#e879f9",
  },
  gaming: {
    group: "topics",
    icon: Gamepad2,
    tint: "#10291f",
    border: "#1f5a43",
    card: "#0f221a",
    accent: "#34d399",
  },
  "tech-talk": {
    group: "topics",
    icon: Cpu,
    tint: "#0f2433",
    border: "#1f4f73",
    card: "#0e1e2b",
    accent: "#38bdf8",
  },
};

const OTHER: RoomTheme = { group: "topics", icon: Hash, ...PLAIN };

export const roomTheme = (slug: string): RoomTheme => THEMES[slug] ?? OTHER;

// The theme as the variables that the classes of the components read (`bg-(--room-tint)` and so on).
export function roomVars(slug: string | undefined): CSSProperties | undefined {
  if (slug === undefined) return undefined;

  const theme = roomTheme(slug);

  return {
    "--room-tint": theme.tint,
    "--room-border": theme.border,
    "--room-card": theme.card,
    "--room-accent": theme.accent,
  } as CSSProperties;
}

const GROUPS: RoomGroup[] = ["topics", "open"];

// The rooms in the order they are listed in: the ones about something first, the open ones last, and in each group by
// name.
export function sortRooms(rooms: Room[], language: string): Room[] {
  const collator = new Intl.Collator(language);

  return [...rooms].sort(
    (a, b) =>
      GROUPS.indexOf(roomTheme(a.slug).group) -
        GROUPS.indexOf(roomTheme(b.slug).group) ||
      collator.compare(a.name, b.name),
  );
}

// The same, in its groups.
export function groupRooms(
  rooms: Room[],
  language: string,
): { group: RoomGroup; rooms: Room[] }[] {
  const sorted = sortRooms(rooms, language);

  return GROUPS.map((group) => ({
    group,
    rooms: sorted.filter((room) => roomTheme(room.slug).group === group),
  })).filter((entry) => entry.rooms.length > 0);
}
