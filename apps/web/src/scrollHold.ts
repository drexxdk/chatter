// While a dialog or menu is on the page, Headless UI locks the page's scrolling, and each of its changes to the page
// (hiding the scrollbar, padding to match, bringing it back) can move the scroll position: the page is briefly a
// different width, so a different height, and the position is clamped to it. Nothing the guest did moved it, so this
// puts it back: while the page is locked its position is held where it was, and once the popup is gone it is
// restored, to the end if that is where the guest was.
const POPUP = '[role="dialog"], [role="menu"], [role="listbox"]';

// Layout settles over a few frames after the scrollbar returns.
const SETTLE_FRAMES = 8;

const EPSILON = 0.5;

export function holdScrollWhilePopups() {
  const page = document.documentElement;
  const distance = () => page.scrollHeight - page.scrollTop - page.clientHeight;
  const popupOpen = () => document.querySelector(POPUP) !== null;
  const locked = () => getComputedStyle(page).overflow === "hidden";

  // Where the page was before any popup, kept from its scroll events: by the time a popup is seen, whatever opened it
  // may already have moved the page.
  let top = page.scrollTop;
  let atEnd = distance() < 1;
  // Set while a popup is open; `locked` once the page has been seen locked, which is what makes it worth restoring.
  let held: { top: number; atEnd: boolean; locked: boolean } | null = null;
  let settling = 0;

  const restore = () => {
    if (!held) return;

    const target = held.atEnd
      ? page.scrollHeight - page.clientHeight
      : held.top;

    if (Math.abs(page.scrollTop - target) > EPSILON) page.scrollTop = target;
  };

  const settle = () => {
    const run = ++settling;
    let frames = 0;

    const tick = () => {
      if (run !== settling) return;

      restore();
      if (++frames < SETTLE_FRAMES) requestAnimationFrame(tick);
      else held = null;
    };

    tick();
  };

  // The guest taking over, once the popup is gone, ends the restoring; input to the popup itself does not.
  const stopSettling = () => {
    if (popupOpen()) return;

    settling++;
    held = null;
  };
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) {
    window.addEventListener(type, stopSettling, { passive: true });
  }

  window.addEventListener(
    "scroll",
    () => {
      if (popupOpen()) {
        if (held?.locked && locked()) restore();
        return;
      }

      top = page.scrollTop;
      atEnd = distance() < 1;
    },
    { passive: true },
  );

  let wasOpen = popupOpen();

  const update = () => {
    const open = popupOpen();

    if (open && !wasOpen) {
      settling++;
      held = { top, atEnd, locked: false };
    }

    if (open && held && locked()) {
      held.locked = true;
      restore();
    }

    if (!open && wasOpen && held) {
      if (held.locked) settle();
      else held = null;
    }

    wasOpen = open;
  };

  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true });
  observer.observe(page, { attributes: true, attributeFilter: ["style"] });
}
