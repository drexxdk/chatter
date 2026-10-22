import { isTouchScreen } from "./touch";

// Browsers scroll the page to where a focused element sits in the layout, not to where its sticky box is stuck, so
// handing focus back to a button in the sticky header or footer (as a dropdown or dialog does when it closes) throws
// the page to the top. A sticky box is always in view, so focusing inside one never needs to scroll. The same goes for
// a popup (a menu or a panel opening from a button) that focuses its first item: it is not yet where it will be placed,
// so the page would scroll to wherever it starts, and it is placed in view anyway. So does the button that opened it, when
// the guest clicked it or focus comes back to it: the page has a scroll padding below the sticky header, so a button
// that was clicked just under the header would otherwise be scrolled away from the pointer. Tab does not go through
// focus(), so a Tab that lands in a sticky box puts the page back where it was.
export function keepStickyInView() {
  const focus = HTMLElement.prototype.focus;
  let tappedField: HTMLElement | null = null;
  let keyboardNavigation = false;

  const onPointerDown = (event: PointerEvent) => {
    keyboardNavigation = false;
    tappedField =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(
            'input, textarea, [contenteditable]:not([contenteditable="false"])',
          )
        : null;
  };

  HTMLElement.prototype.focus = function (this: HTMLElement, options) {
    if (
      isTouchScreen() &&
      opensKeyboard(this) &&
      !keyboardNavigation &&
      this !== document.activeElement &&
      this !== tappedField
    ) {
      return;
    }

    return focus.call(
      this,
      options?.preventScroll === undefined && keepsPageStill(this)
        ? { ...options, preventScroll: true }
        : options,
    );
  };

  let tabFrom: { x: number; y: number } | null = null;

  const onKeyDown = (event: KeyboardEvent) => {
    keyboardNavigation = event.key === "Tab";
    if (event.key === "Tab") tabFrom = { x: scrollX, y: scrollY };
  };

  const onKeyUp = () => {
    keyboardNavigation = false;
  };

  const onFocusIn = (event: FocusEvent) => {
    const from = tabFrom;
    tabFrom = null;

    if (!from || !(event.target instanceof HTMLElement)) return;
    if (!keepsPageStill(event.target)) return;

    // The browser scrolls as it focuses, and may do the rest after this event.
    const restore = () => {
      if (scrollX !== from.x || scrollY !== from.y) {
        scrollTo({ left: from.x, top: from.y, behavior: "instant" });
      }
    };

    restore();
    requestAnimationFrame(restore);
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("focusin", onFocusIn, true);

  return () => {
    HTMLElement.prototype.focus = focus;
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("focusin", onFocusIn, true);
  };
}

function opensKeyboard(element: HTMLElement) {
  if (element instanceof HTMLInputElement) {
    return ![
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ].includes(element.type);
  }

  return element.matches(
    'textarea, [contenteditable]:not([contenteditable="false"])',
  );
}

const POPUP =
  '[role="menu"], [id^="headlessui-popover-panel"], [id^="headlessui-popover-button"], [id^="headlessui-menu-button"]';

function keepsPageStill(element: HTMLElement) {
  if (element.closest(POPUP)) return true;

  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (getComputedStyle(node).position === "sticky") return true;
  }

  return false;
}
