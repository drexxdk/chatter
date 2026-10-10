// What the dropdowns share, so that they look and scroll alike: a dark scrollbar, and the whole box scrolling when the
// screen has no room for all of it.
const SCROLLS = "overflow-y-auto [color-scheme:dark]";

// A list of things to choose (a menu or a list box).
export const MENU_SURFACE = `rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg focus:outline-none ${SCROLLS}`;

// A panel with more in it than a list (a search box, tabs, a grid).
export const PANEL_SURFACE = `rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl ${SCROLLS}`;

// The tallest a panel gets, when there is room: fixed for a panel that always has that much in it, a cap for one that
// has less when it has little to show. (Whole class names, for Tailwind to find.)
export const PANEL_HEIGHT = "h-[26rem]";
export const PANEL_MAX_HEIGHT = "max-h-[26rem]";

// The base of a row in a menu; each menu adds its own spacing.
export const MENU_ITEM =
  "flex w-full items-center rounded text-left text-sm data-focus:bg-neutral-800 data-disabled:opacity-50";

// The header's dropdowns: fixed (a portal in the document would make the page scroll to the option), just below the
// header's 2.25rem buttons (in its 3.5rem), and no taller than reaches the bottom edge of the message box.
export const HEADER_DROPDOWN =
  "fixed top-[2.875rem] z-50 mt-1 max-h-[calc(100dvh-3.875rem)]";
