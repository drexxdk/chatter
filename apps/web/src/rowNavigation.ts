import { useState, type FocusEvent, type KeyboardEvent } from "react";

import { revealMessage } from "./messageNavigation";

const PAGE = 5;

// What a row with nothing to do needs to be a stop like the others: focusable (only when it is the tab stop), found by
// the arrow keys, and shown when it has focus.
export const navStop = (id: string, tabStop: boolean) => ({
  "data-nav-id": id,
  tabIndex: tabStop ? 0 : -1,
});

export const NAV_STOP_CLASS =
  "outline-none focus-visible:bg-neutral-100/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-indigo-400";

// One tab stop for a list of rows, with the arrow keys moving between them. The stop is the row focused while focus is
// in the list, and the newest one otherwise, since that is what the page is scrolled to. Rows mark themselves with
// `data-nav-id`.
export function useRowNavigation(ids: string[]) {
  const [current, setCurrent] = useState<string | null>(null);
  const stopId =
    current && ids.includes(current) ? current : (ids.at(-1) ?? null);

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const id = (event.target as HTMLElement).dataset.navId;
    if (id) setCurrent(id);
  };

  // Coming back to the list starts at the newest message again, not wherever the guest had read to.
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setCurrent(null);
    }
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    // The message itself, or one of its actions (the bar's buttons, its GIF, its reactions): up and down always change
    // message, wherever in one the focus is.
    const row = target.dataset.navId
      ? target
      : target
          .closest<HTMLElement>("[data-message]")
          ?.querySelector<HTMLElement>("[data-nav-id]");
    if (!row) return;

    const at = ids.indexOf(row.dataset.navId ?? "");
    const moves: Record<string, number> = {
      ArrowUp: at - 1,
      ArrowDown: at + 1,
      PageUp: at - PAGE,
      PageDown: at + PAGE,
      Home: 0,
      End: ids.length - 1,
    };

    const to = moves[event.key];
    if (to === undefined) return;

    // The menu button would otherwise open its menu on the arrow keys.
    event.preventDefault();
    event.stopPropagation();
    const id = ids[Math.min(Math.max(to, 0), ids.length - 1)];
    if (id)
      revealMessage(event.currentTarget, id, (element) => element.focus());
  };

  return { stopId, onFocus, onBlur, onKeyDownCapture };
}
