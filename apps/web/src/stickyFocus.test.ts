import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { keepStickyInView } from "./stickyFocus";

describe("keepStickyInView", () => {
  const original = HTMLElement.prototype.focus;
  const calls = vi.fn();

  beforeEach(() => {
    calls.mockReset();
    HTMLElement.prototype.focus = function (options) {
      calls(options);
    };
    keepStickyInView();
  });

  afterEach(() => {
    HTMLElement.prototype.focus = original;
    document.body.innerHTML = "";
  });

  it("does not scroll to an element inside a sticky box", () => {
    document.body.innerHTML = `<header style="position: sticky"><button></button></header>`;

    document.querySelector("button")!.focus();

    expect(calls).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("leaves other elements, and a choice that was made, alone", () => {
    document.body.innerHTML = `<main><button></button></main><header style="position: sticky"><a href="#"></a></header>`;

    document.querySelector("button")!.focus();
    document.querySelector("a")!.focus({ preventScroll: false });

    expect(calls).toHaveBeenNthCalledWith(1, undefined);
    expect(calls).toHaveBeenNthCalledWith(2, { preventScroll: false });
  });
});
