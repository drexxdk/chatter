import {
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

const ITEM = "[data-grid-item]";
const KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

// The item the arrow key leads to, found by where the items are on the screen, so it works for a grid of equal cells and
// for pictures in columns alike. Sideways it is the nearest item beside this one, and when this is the last in its row,
// the next item in the order they are written, which is the start of the next row. Up and down it is the nearest one
// above or below, in the same column if there is one.
export function neighbour(
  items: HTMLElement[],
  current: HTMLElement,
  key: string,
): HTMLElement | undefined {
  const at = items.indexOf(current);
  if (at < 0) return undefined;
  if (key === "Home") return items[0];
  if (key === "End") return items[items.length - 1];

  const from = current.getBoundingClientRect();
  const x = (from.left + from.right) / 2;
  const y = (from.top + from.bottom) / 2;
  const sideways = key === "ArrowLeft" || key === "ArrowRight";
  const sign = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  let best: HTMLElement | undefined;
  let bestScore = Infinity;

  for (const item of items) {
    if (item === current) continue;

    const box = item.getBoundingClientRect();
    const ix = (box.left + box.right) / 2;
    const iy = (box.top + box.bottom) / 2;
    let score: number;

    if (sideways) {
      const along = (ix - x) * sign;
      const shared =
        Math.min(box.bottom, from.bottom) - Math.max(box.top, from.top);
      if (along <= 1 || shared <= 0) continue;
      score = along + Math.abs(iy - y) * 0.5;
    } else {
      const along = (iy - y) * sign;
      if (along <= Math.min(from.height, box.height) / 2) continue;
      score = along + Math.abs(ix - x) * 3;
    }

    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (best) return best;

  return sideways ? items[at + sign] : undefined;
}

// A grid of buttons (marked `data-grid-item`) that is one tab stop, with the arrow keys moving between them: the
// stop is the item focused last, or the first. `onLeaveUp` is called for the arrow up from the top row.
export function useGridNavigation({
  onLeaveUp,
}: { onLeaveUp?: () => void } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const stop = useRef<HTMLElement | null>(null);

  const items = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);

  // Whatever was rendered, exactly one item is where Tab stops.
  useLayoutEffect(() => {
    const all = items();

    if (!stop.current || !all.includes(stop.current)) {
      stop.current = all[0] ?? null;
    }

    for (const item of all) item.tabIndex = item === stop.current ? 0 : -1;
  });

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
    if (!item || item === stop.current) return;

    if (stop.current) stop.current.tabIndex = -1;
    item.tabIndex = 0;
    stop.current = item;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!KEYS.has(event.key) || !target.matches(ITEM)) return;

    event.preventDefault();
    const next = neighbour(items(), target, event.key);

    if (next) next.focus();
    else if (event.key === "ArrowUp") onLeaveUp?.();
  };

  return {
    ref,
    onFocus,
    onKeyDown,
    focus: () => (stop.current ?? items()[0])?.focus(),
  };
}
