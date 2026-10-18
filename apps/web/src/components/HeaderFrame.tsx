import { useLayoutEffect, useRef, type ReactNode } from "react";

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
  const header = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const page = document.documentElement;
    const previous = page.style.getPropertyValue("--header-height");
    const measure = () => {
      const height = header.current?.getBoundingClientRect().height;
      if (height) page.style.setProperty("--header-height", `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (header.current) observer.observe(header.current);
    return () => {
      observer.disconnect();
      if (previous) page.style.setProperty("--header-height", previous);
      else page.style.removeProperty("--header-height");
    };
  }, []);
  return (
    <div
      ref={header}
      style={roomVars(roomSlug)}
      className="sticky top-0 z-30 bg-[var(--room-tint,var(--color-neutral-950))]"
    >
      <div className="border-b border-[var(--room-border,var(--color-neutral-800))]">
        <header
          className={`relative mx-auto flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-(--page-gutter) py-2 sm:flex-nowrap sm:py-0 ${wide ? "max-w-none" : "max-w-4xl"}`}
        >
          {children}
        </header>
      </div>
    </div>
  );
}
