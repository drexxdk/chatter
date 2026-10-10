// After choosing somebody to write to with the keyboard, the cursor goes to the message box so the guest can start
// typing; for somebody who is blocked there is no box to type in, so it goes to the button that unblocks them. It
// waits for slide-outs and menus to be gone first: they hand focus back to what opened them as they close, which would
// take it away again. Not after a tap, where it would only open the keyboard on a phone; a click with a mouse is fine.
export function focusMessageBox() {
  if (document.documentElement.getAttribute("data-pointer") === "touch") return;

  const started = performance.now();

  const attempt = () => {
    const overlay = document.querySelector('[role="dialog"], [role="menu"]');
    const box = document.querySelector<HTMLElement>(
      "#message:not(:disabled), #direct-message:not(:disabled), #unblock-direct",
    );

    if (!overlay && box) {
      box.focus();
      // Once more, in case something was still handing focus back as this ran.
      requestAnimationFrame(() => box.focus());
    } else if (performance.now() - started < 8000) {
      requestAnimationFrame(attempt);
    }
  };

  requestAnimationFrame(attempt);
}
