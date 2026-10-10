import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollToEnd } from "./components/ScrollToEnd";

// jsdom has no layout, so the page's size and position are set by hand.
function page(scrollHeight: number, scrollTop: number, clientHeight = 500) {
  const root = document.documentElement;
  Object.defineProperty(root, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(root, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  root.scrollTop = scrollTop;
}

const scrollTo = vi.fn();

beforeEach(() => {
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  scrollTo.mockReset();
});

afterEach(() => {
  for (const name of ["scrollHeight", "clientHeight"]) {
    delete (document.documentElement as unknown as Record<string, unknown>)[
      name
    ];
  }
});

describe("the button to scroll to the newest message", () => {
  it("is not shown while the page is at its end", () => {
    page(2000, 1500);

    render(<ScrollToEnd />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is shown once the page is scrolled up, and goes again at the end", () => {
    page(2000, 1500);
    render(<ScrollToEnd />);

    page(2000, 800);
    act(() => void fireEvent.scroll(window));

    expect(
      screen.getByRole("button", { name: "Scroll to the latest messages" }),
    ).toBeInTheDocument();

    page(2000, 1500);
    act(() => void fireEvent.scroll(window));

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is shown as soon as the page is scrolled up, however little", () => {
    page(2000, 1500);
    render(<ScrollToEnd />);
    expect(screen.queryByRole("button")).toBeNull();

    page(2000, 1490);
    act(() => void fireEvent.scroll(window));

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("is not shown for the pixel or so a screen's fractions can leave at the end", () => {
    page(2000, 1499.5);

    render(<ScrollToEnd />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is shown when the page grows under a guest who is reading further up", () => {
    page(2000, 1500);
    render(<ScrollToEnd />);
    expect(screen.queryByRole("button")).toBeNull();

    page(2400, 1500);
    act(() => void fireEvent(window, new Event("resize")));

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("takes the guest to the end of the page", async () => {
    page(2000, 100);
    render(<ScrollToEnd />);

    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Scroll to the latest messages" }),
      );

    expect(scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: "smooth" });
  });
});
