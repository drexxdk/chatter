export const MESSAGE_REVEAL_EVENT = "chatter:reveal-message";
export const MESSAGE_READING_EVENT = "chatter:reading-messages";

export interface MessageReveal {
  id: string;
  reveal: (element: HTMLElement) => void;
}

export function revealMessage(
  root: HTMLElement | Document,
  id: string,
  reveal: (element: HTMLElement) => void,
) {
  const target = Array.from(
    root.querySelectorAll<HTMLElement>('[role="log"] [data-nav-id]'),
  ).find(
    (element) =>
      element.dataset.navId === id && !element.closest("[hidden], [inert]"),
  );
  if (target) {
    target.dispatchEvent(new Event(MESSAGE_READING_EVENT, { bubbles: true }));
    reveal(target);
    return;
  }
  const logs =
    root instanceof HTMLElement && root.matches('[role="log"]')
      ? [root]
      : Array.from(root.querySelectorAll<HTMLElement>('[role="log"]'));
  for (const log of logs) {
    log.dispatchEvent(new Event(MESSAGE_READING_EVENT, { bubbles: true }));
    log.dispatchEvent(
      new CustomEvent<MessageReveal>(MESSAGE_REVEAL_EVENT, {
        detail: { id, reveal },
      }),
    );
  }
}
