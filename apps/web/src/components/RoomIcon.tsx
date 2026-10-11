import clsx from "clsx";

import { roomTheme, roomVars } from "../roomThemes";

// The room's icon, in the room's own color.
export function RoomIcon({
  slug,
  className = "h-5 w-5",
}: {
  slug: string;
  className?: string;
}) {
  const Icon = roomTheme(slug).icon;

  return (
    <Icon
      aria-hidden="true"
      style={roomVars(slug)}
      className={clsx("shrink-0 text-(--room-accent)", className)}
    />
  );
}
