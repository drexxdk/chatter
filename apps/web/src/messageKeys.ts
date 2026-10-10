import type { KeyboardEvent } from "react";
import { flushSync } from "react-dom";

// What can be done with one message from the keyboard, in the order it appears on the screen: the buttons of the bar
// above it, the play or stop button of its GIF, and the reactions under it. Left and right walk along this line;
// up and down always change message (see rowNavigation.ts), and Escape goes back to the message.
export function actionsOf(message: HTMLElement): HTMLElement[] {
  const present = (selector: string) =>
    Array.from(message.querySelectorAll<HTMLElement>(selector)).filter(
      (element) => !(element as HTMLButtonElement).disabled,
    );

  return [
    ...present("[data-bar] button"),
    ...present("[data-gif-toggle]"),
    ...present("[data-chip]"),
  ];
}

// The message itself, which is the arrow-key stop of the list.
export const stopOf = (message: HTMLElement) =>
  message.querySelector<HTMLElement>("[data-nav-id]");

// Where Left, Right or Escape lead from `from`, or undefined when they lead nowhere.
export function neighbourAction(
  message: HTMLElement,
  from: HTMLElement,
  key: string,
): HTMLElement | undefined {
  const stop = stopOf(message);
  const actions = actionsOf(message);
  const at = actions.indexOf(from);

  if (from === stop) {
    return key === "ArrowRight" ? actions[0] : undefined;
  }
  if (at < 0) return undefined;

  if (key === "ArrowRight")
    return actions[Math.min(at + 1, actions.length - 1)];
  if (key === "ArrowLeft")
    return at === 0 ? (stop ?? undefined) : actions[at - 1];
  if (key === "Escape") return stop ?? undefined;

  return undefined;
}

// The handler for a message's wrapper. `onEngaged` says whether focus is now on one of the actions rather than on the
// message. Returns whether the key was used.
export function onMessageKey(
  event: KeyboardEvent<HTMLElement>,
  onEngaged?: (engaged: boolean) => void,
): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  const message = event.currentTarget;
  const to = neighbourAction(message, event.target as HTMLElement, event.key);
  if (!to) return false;

  event.preventDefault();
  // The bar is shown while the message or something in it has keyboard focus. Focus passes through nothing on its way
  // from one to the other, and if the bar is not held open by then it is hidden and cannot take the focus.
  flushSync(() => onEngaged?.(to !== stopOf(message)));
  to.focus();

  return true;
}
