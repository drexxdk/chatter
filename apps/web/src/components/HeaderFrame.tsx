import type { ReactNode } from "react";

import { roomVars } from "../roomThemes";

// The bar across the top of every page: across the whole window, with the room's colours under its border when there is
// one. What is in it (a title or a way back, the menu) is the page's own.
export function HeaderFrame({
  roomSlug,
  wide = false,
  children,
}: {
  roomSlug?: string;
  // As wide as the window, for a room's page: the people on the left edge and the chat in what is left.
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={roomVars(roomSlug)}
      className="sticky top-0 z-30 bg-[var(--room-tint,var(--color-neutral-950))]"
    >
      <div className="border-b border-[var(--room-border,var(--color-neutral-800))]">
        <header
          className={`relative mx-auto flex h-14 items-center justify-between gap-3 px-(--page-gutter) ${wide ? "max-w-none" : "max-w-4xl"}`}
        >
          {children}
        </header>
      </div>
    </div>
  );
}
