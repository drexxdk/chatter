import { createElement, StrictMode } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMessageEffects } from "./messageEffects";
import { MessageLog } from "./MessageLog";
import { MessageGroup, type GroupMessage } from "./MessageRow";

const originalAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalAnimate)
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

function group() {
  const element = document.createElement("li");
  const animate = vi.fn();
  element.animate = animate;
  return { element, animate };
}

describe("message entrance effects", () => {
  it("animates a new React bubble once without replaying history or remounts", () => {
    const history: GroupMessage = {
      id: "history",
      text: "already here",
      sentAt: new Date().toISOString(),
    };
    const incoming: GroupMessage = {
      ...history,
      id: "incoming",
      text: "new message",
    };
    const log = (messages: GroupMessage[]) =>
      createElement(
        StrictMode,
        null,
        createElement(
          MessageLog,
          { label: "Messages" },
          createElement(MessageGroup, {
            mine: false,
            nickname: "Bob",
            role: "guest",
            avatar: "other",
            messages,
          }),
        ),
      );
    const animate = vi.mocked(HTMLElement.prototype.animate);
    const view = render(log([history]));
    expect(animate).not.toHaveBeenCalled();
    view.rerender(log([history, incoming]));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toHaveAttribute(
      "data-message-id",
      "incoming",
    );
    view.rerender(log([{ ...history }, { ...incoming }]));
    expect(animate).toHaveBeenCalledTimes(1);
    view.unmount();
    render(log([history, incoming]));
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("does not animate the initial history or replay known messages", () => {
    const effects = createMessageEffects();
    const { element, animate } = group();
    effects.reveal(element, ["history"], false);
    effects.ready();
    effects.reveal(element, ["history"], false);
    expect(animate).not.toHaveBeenCalled();
  });

  it.each([
    [false, -72, "left bottom"],
    [true, 72, "right bottom"],
  ] as const)(
    "slides mine=%s messages from their own side",
    (mine, offset, origin) => {
      const effects = createMessageEffects();
      const { element, animate } = group();
      effects.ready();
      effects.reveal(element, ["new"], mine);
      expect(animate).toHaveBeenCalledWith(
        [
          {
            opacity: 0,
            transform: `translateX(${offset}px) scale(0.85)`,
            transformOrigin: origin,
          },
          {
            opacity: 1,
            transform: "translateX(0) scale(1)",
            transformOrigin: origin,
          },
        ],
        { duration: 340, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
      effects.reveal(element, ["new"], mine);
      expect(animate).toHaveBeenCalledTimes(1);
    },
  );

  it("animates only the added bubble in an existing group", () => {
    const effects = createMessageEffects();
    const { element, animate } = group();
    const bubble = document.createElement("div");
    bubble.dataset.messageId = "second";
    bubble.animate = vi.fn();
    element.append(bubble);
    effects.reveal(element, ["first"], false);
    effects.ready();
    effects.reveal(element, ["first", "second"], false);
    expect(animate).not.toHaveBeenCalled();
    expect(bubble.animate).toHaveBeenCalledTimes(1);
  });

  it("does not animate reduced-motion messages or replay them later", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const effects = createMessageEffects();
    const { element, animate } = group();
    effects.ready();
    effects.reveal(element, ["new"], false);
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not animate messages arriving in a hidden conversation", () => {
    const effects = createMessageEffects();
    const { element, animate } = group();
    const hidden = document.createElement("div");
    hidden.hidden = true;
    hidden.append(element);
    effects.ready();
    effects.reveal(element, ["new"], false);
    hidden.hidden = false;
    effects.reveal(element, ["new"], false);
    expect(animate).not.toHaveBeenCalled();
  });
});
