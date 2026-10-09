import { afterEach, describe, expect, it } from "vitest";

import { trackInputMode } from "./inputMode";

describe("trackInputMode", () => {
  let stop: () => void;

  afterEach(() => stop());

  const pressed = (target: Element, key: string) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

  it("marks the page as pointer-driven after a click, and clears it on Tab", () => {
    stop = trackInputMode();
    const html = document.documentElement;

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(html).toHaveAttribute("data-pointer");

    pressed(document.body, "Tab");
    expect(html).not.toHaveAttribute("data-pointer");
  });

  it("does not take typing in a text box for keyboard navigation", () => {
    stop = trackInputMode();
    const input = document.body.appendChild(document.createElement("input"));

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    pressed(input, "a");
    pressed(input, " ");
    pressed(input, "ArrowLeft");

    expect(document.documentElement).toHaveAttribute("data-pointer");
    input.remove();
  });

  it("treats arrows and Escape elsewhere as keyboard use", () => {
    stop = trackInputMode();
    const html = document.documentElement;

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    pressed(document.body, "ArrowDown");
    expect(html).not.toHaveAttribute("data-pointer");

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    pressed(document.body, "Escape");
    expect(html).not.toHaveAttribute("data-pointer");
  });
});
