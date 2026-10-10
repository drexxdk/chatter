const NAVIGATION_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "Enter",
  " ",
]);

// Browsers always outline a focused text box, even after a click. Focus rings are for the keyboard, so the page says
// when the pointer was the last thing used (`data-pointer` on <html>, holding its type: "mouse", "touch" or "pen") and
// the stylesheet hides the ring then.
export function trackInputMode(root: HTMLElement = document.documentElement) {
  const pointer = (event: Event) =>
    root.setAttribute(
      "data-pointer",
      (event as PointerEvent).pointerType ?? "",
    );
  const keyboard = () => root.removeAttribute("data-pointer");

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" || event.key === "Escape") return keyboard();

    // Typing, or moving the caret, in a text box says nothing about how it was reached.
    const target = event.target;
    const editing =
      target instanceof HTMLElement &&
      target.matches("input, textarea, select, [contenteditable]");

    if (!editing && NAVIGATION_KEYS.has(event.key)) keyboard();
  };

  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("pointerdown", pointer, true);
    document.removeEventListener("keydown", onKeyDown, true);
    root.removeAttribute("data-pointer");
  };
}
