import {
  useCallback,
  useEffect,
  useRef,
  type Ref,
  type RefObject,
} from "react";

// A ref to keep for oneself on an element that a parent may also want a ref to.
export function useSharedRef<T>(external?: Ref<T>) {
  const own = useRef<T | null>(null);
  const set = useCallback(
    (element: T | null) => {
      own.current = element;

      if (typeof external === "function") external(element);
      else if (external) (external as RefObject<T | null>).current = element;
    },
    [external],
  );

  return [own, set] as const;
}

// Placed inside a menu or panel opened from a button: when it closes and the keyboard was in use, focus goes back to
// that button if it was dropped on the way (the page, not an element, is left with it), so that Escape or a choice never
// strands the guest.
export function ReturnFocus({ to }: { to: RefObject<HTMLElement | null> }) {
  useEffect(
    () => () => {
      if (document.documentElement.hasAttribute("data-pointer")) return;

      requestAnimationFrame(() => {
        const lost =
          !document.activeElement || document.activeElement === document.body;

        if (lost) to.current?.focus({ preventScroll: true });
      });
    },
    [to],
  );

  return null;
}
