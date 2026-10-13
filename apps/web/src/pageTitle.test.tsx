import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "./i18n";
import { usePageTitle } from "./usePageTitle";

const iconOf = () => document.querySelector('link[rel="icon"]');

beforeEach(() => {
  document.head.insertAdjacentHTML(
    "beforeend",
    '<link rel="icon" href="/favicon.svg" />',
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("badges the icon of the app with the number, and takes the badge off when all is read", () => {
    const setAppBadge = vi.fn(async () => {});
    const clearAppBadge = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, setAppBadge, clearAppBadge });

    const { rerender } = renderHook(
      ({ unread }) => usePageTitle("Dating", unread),
      { initialProps: { unread: 3 } },
    );
    expect(setAppBadge).toHaveBeenLastCalledWith(3);

    rerender({ unread: 4 });
    expect(setAppBadge).toHaveBeenLastCalledWith(4);

    rerender({ unread: 0 });
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it("is fine in a browser that has no badges", () => {
    const { rerender } = renderHook(
      ({ unread }) => usePageTitle("Dating", unread),
      { initialProps: { unread: 1 } },
    );

    rerender({ unread: 0 });

    expect(document.title).toBe("Dating \u2013 Chatter");
  });
});
