import { useEffect, useRef } from "react";

// Placed in a popup that has just opened: puts the cursor in its search box, so the guest can type or use the arrow keys
// at once. Not on a touch screen, where that would open the keyboard.
export function FocusSearch() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (
      typeof matchMedia === "function" &&
      matchMedia("(hover: none)").matches
    ) {
      return;
    }

    // After the popup has had its own go at moving focus.
    const frame = requestAnimationFrame(() =>
      marker.current
        ?.closest('[role="dialog"]')
        ?.querySelector<HTMLElement>('input[type="search"]')
        ?.focus(),
    );

    return () => cancelAnimationFrame(frame);
  }, []);

  return <span ref={marker} hidden />;
}
