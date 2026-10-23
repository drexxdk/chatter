import { createContext } from "react";

export function createMessageEffects() {
  const seen = new Set<string>();
  let ready = false;

  return {
    remember(ids: string[]) {
      for (const id of ids) seen.add(id);
    },
    ready() {
      ready = true;
    },
    reveal(group: HTMLElement, ids: string[], mine: boolean) {
      const fresh = ids.filter((id) => !seen.has(id));
      for (const id of ids) seen.add(id);
      if (
        !ready ||
        fresh.length === 0 ||
        group.closest("[hidden]") ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      )
        return;

      const targets =
        fresh.length === ids.length
          ? [group]
          : Array.from(
              group.querySelectorAll<HTMLElement>("[data-message-id]"),
            ).filter((bubble) =>
              fresh.includes(bubble.dataset.messageId ?? ""),
            );

      for (const target of targets) {
        target.animate?.(
          [
            {
              opacity: 0,
              transform: `translateX(${mine ? 72 : -72}px) scale(0.85)`,
              transformOrigin: mine ? "right bottom" : "left bottom",
            },
            {
              opacity: 1,
              transform: "translateX(0) scale(1)",
              transformOrigin: mine ? "right bottom" : "left bottom",
            },
          ],
          {
            duration: 340,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          },
        );
      }
    },
  };
}

export const MessageEffectsContext = createContext<ReturnType<
  typeof createMessageEffects
> | null>(null);
