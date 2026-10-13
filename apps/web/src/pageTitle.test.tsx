import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "./i18n";
import { usePageTitle } from "./usePageTitle";

let focused = true;

const setFocus = (value: boolean) => {
  focused = value;
  act(() => {
    window.dispatchEvent(new Event(value ? "focus" : "blur"));
  });
};

const iconOf = () => document.querySelector('link[rel="icon"]');

beforeEach(() => {
  focused = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.useFakeTimers();
  document.head.insertAdjacentHTML(
    "beforeend",
    '<link rel="icon" href="/favicon.svg" />',
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  iconOf()?.remove();
});

describe("the title of the page", () => {
  it("is the page before the site, or the site alone", () => {
    const { rerender } = renderHook(({ page }) => usePageTitle(page), {
      initialProps: { page: "Dating" as string | undefined },
    });

    expect(document.title).toBe("Dating \u2013 Chatter");

    rerender({ page: undefined });

    expect(document.title).toBe("Chatter");
  });

  it("starts with the number of private messages not seen, in the language of the page, and puts a dot on the icon", async () => {
    const { rerender } = renderHook(
      ({ unread }) => usePageTitle("Dating", unread),
      { initialProps: { unread: 0 } },
    );
    expect(iconOf()?.getAttribute("href")).toBe("/favicon.svg");

    rerender({ unread: 1 });
    expect(document.title).toBe("(1 message) Dating \u2013 Chatter");
    expect(iconOf()?.getAttribute("href")).toBe("/favicon-unread.svg");

    rerender({ unread: 2 });
    expect(document.title).toBe("(2 messages) Dating \u2013 Chatter");

    await act(() => i18n.changeLanguage("da"));
    expect(document.title).toBe("(2 beskeder) Dating \u2013 Chatter");

    rerender({ unread: 0 });
    expect(document.title).toBe("Dating \u2013 Chatter");
    expect(iconOf()?.getAttribute("href")).toBe("/favicon.svg");
  });

  it("does not blink while somebody is looking at the page", () => {
    renderHook(() => usePageTitle("Dating", 2));

    act(() => void vi.advanceTimersByTime(5000));

    expect(document.title).toBe("(2 messages) Dating \u2013 Chatter");
  });

  it("blinks to a line about a new message while nobody is looking, and stops when they come back", () => {
    focused = false;
    renderHook(() => usePageTitle("Dating", 2));

    expect(document.title).toBe("(2 messages) Dating \u2013 Chatter");
    act(() => void vi.advanceTimersByTime(1000));
    expect(document.title).toBe("\u{1F4AC} New message");
    act(() => void vi.advanceTimersByTime(1000));
    expect(document.title).toBe("(2 messages) Dating \u2013 Chatter");
    act(() => void vi.advanceTimersByTime(1000));
    expect(document.title).toBe("\u{1F4AC} New message");

    setFocus(true);
    act(() => void vi.advanceTimersByTime(5000));

    expect(document.title).toBe("(2 messages) Dating \u2013 Chatter");
  });

  it("does not blink with nothing to see", () => {
    focused = false;
    renderHook(() => usePageTitle("Dating", 0));

    act(() => void vi.advanceTimersByTime(3000));

    expect(document.title).toBe("Dating \u2013 Chatter");
  });
});
