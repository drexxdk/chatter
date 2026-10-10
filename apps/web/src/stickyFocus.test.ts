import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { keepStickyInView } from "./stickyFocus";

describe("keepStickyInView", () => {
  const original = HTMLElement.prototype.focus;
  const calls = vi.fn();
  let stop: () => void;

  beforeEach(() => {
    calls.mockReset();
    HTMLElement.prototype.focus = function (options) {
      calls(options);
    };
    stop = keepStickyInView();
  });

  afterEach(() => {
    stop();
    HTMLElement.prototype.focus = original;
    document.body.innerHTML = "";
  });

  describe("when Tab moves focus", () => {
    const scrollTo = vi.fn();
    const scrolledTo = (y: number) =>
      Object.defineProperty(window, "scrollY", {
        value: y,
        configurable: true,
      });

    beforeEach(() => {
      scrollTo.mockReset();
      vi.stubGlobal("scrollTo", scrollTo);
      scrolledTo(500);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      scrolledTo(0);
    });

    const tabTo = (target: Element) => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
      // What the browser does as it focuses: scrolls to where the element is in the layout.
      scrolledTo(0);
      target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    };

    it("puts the page back when it lands in a sticky box", () => {
      document.body.innerHTML = `<header style="position: sticky"><button></button></header>`;

      tabTo(document.querySelector("button")!);

      expect(scrollTo).toHaveBeenCalledWith({
        left: 0,
        top: 500,
        behavior: "instant",
      });
    });

    it("leaves the page to the browser anywhere else, and when it was not Tab", () => {
      document.body.innerHTML = `<main><button></button></main><header style="position: sticky"><a href="#"></a></header>`;

      tabTo(document.querySelector("button")!);
      scrolledTo(500);
      scrolledTo(0);
      document
        .querySelector("a")!
        .dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

      expect(scrollTo).not.toHaveBeenCalled();
    });
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

  it("does not scroll to an item in a menu or a popover panel, which is not yet where it will be placed", () => {
    document.body.innerHTML = `<main><div role="menu"><button id="m"></button></div><div id="headlessui-popover-panel-1"><button id="p"></button></div></main>`;

    document.getElementById("m")!.focus();
    document.getElementById("p")!.focus();

    expect(calls).toHaveBeenNthCalledWith(1, { preventScroll: true });
    expect(calls).toHaveBeenNthCalledWith(2, { preventScroll: true });
  });

  it("does not scroll to the button that opens a popup, nor when focus comes back to it", () => {
    document.body.innerHTML = `<main><button id="headlessui-popover-button-1"></button><button id="headlessui-menu-button-2"></button></main>`;

    document.getElementById("headlessui-popover-button-1")!.focus();
    document.getElementById("headlessui-menu-button-2")!.focus();

    expect(calls).toHaveBeenNthCalledWith(1, { preventScroll: true });
    expect(calls).toHaveBeenNthCalledWith(2, { preventScroll: true });
  });
});
