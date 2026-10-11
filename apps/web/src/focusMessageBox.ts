// After choosing somebody to write to with the keyboard, the cursor goes to the message box so the guest can start
// typing; for somebody who is blocked there is no box to type in, so it goes to the button that unblocks them. It
// waits for slide-outs and menus to be gone first: they hand focus back to what opened them as they close, which would
// take it away again. Not after a tap, where it would only open the keyboard on a phone; a click with a mouse is fine.
const TARGETS =
  '#message:not([aria-disabled="true"]), #direct-message:not([aria-disabled="true"]), #unblock-direct';

// How long it keeps an eye on the focus after the first time: the page may still be catching up with what happened (the
// unblock button giving way to the box), and the button that had the focus then takes it along when it goes.
const SETTLE_MS = 600;

// A later call, even one that does nothing after a tap, ends the watch of an earlier one.
let latest = 0;

export function focusMessageBox() {
  const mine = ++latest;
  if (document.documentElement.getAttribute("data-pointer") === "touch") return;

  const started = performance.now();
  let focused: HTMLElement | null = null;
  let focusedAt = 0;

  const attempt = () => {
    if (mine !== latest) return;

    const now = performance.now();
    const overlay = document.querySelector('[role="dialog"], [role="menu"]');
    const box = document.querySelector<HTMLElement>(TARGETS);

    if (focused && now - focusedAt > SETTLE_MS) return;
    if (!focused && now - started > 8000) return;

    if (!overlay && box) {
      const active = document.activeElement;
      // Not when the guest has already moved on to something else themselves.
      const free =
        !focused || !active || active === document.body || active === focused;
      if (!free) return;

      if (active !== box) box.focus();

      if (!focused) focusedAt = now;
      focused = box;
    }

    requestAnimationFrame(attempt);
  };

  requestAnimationFrame(attempt);
}
