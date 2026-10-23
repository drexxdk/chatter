// What the dropdowns share, so that they look and scroll alike: a dark scrollbar, and the whole box scrolling when the
// screen has no room for all of it.
const SCROLLS = "overflow-y-auto [color-scheme:dark]";

// A list of things to choose (a menu or a list box).
export const MENU_SURFACE = `glass-surface glass-menu rounded-md p-1 focus:outline-none ${SCROLLS}`;

// A panel with more in it than a list (a search box, tabs, a grid).
export const PANEL_SURFACE = `glass-surface rounded-md ${SCROLLS}`;

// The tallest a panel gets, when there is room: fixed for a panel that always has that much in it, a cap for one that
// has less when it has little to show. (Whole class names, for Tailwind to find.)
export const PANEL_HEIGHT = "h-[26rem]";
export const PANEL_MAX_HEIGHT = "max-h-[26rem]";

// The base of a row in a menu; each menu adds its own spacing.
export const MENU_ITEM =
  "glass-item flex w-full items-center rounded text-left text-sm data-disabled:opacity-50";

// The header's dropdowns stay fixed, with an 8px gap from both the header and the message box.
export const HEADER_DROPDOWN =
  "fixed top-[calc(var(--header-height,3.5rem)+0.5rem)] z-50 max-h-[max(0px,calc(var(--composer-top,100dvh)-var(--header-height,3.5rem)-1rem))] max-w-[calc(100%-2*var(--page-gutter)-var(--fixed-scrollbar-inset,0px))]";

export const HEADER_MENU = `${HEADER_DROPDOWN} -translate-x-full w-64 space-y-1 ${MENU_SURFACE}`;
