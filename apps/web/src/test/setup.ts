import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// The default of one second is too short for findBy and waitFor when every test file runs at once on a busy machine.
configure({ asyncUtilTimeout: 4000 });

// Newer Node versions define their own experimental `localStorage` and `sessionStorage` globals, which hide jsdom's
// and are undefined without --localstorage-file. Browsers are unaffected, so only the tests need this.
for (const name of ["localStorage", "sessionStorage"] as const) {
  const existing = (
    globalThis as unknown as Record<string, Storage | undefined>
  )[name];

  if (
    typeof existing === "undefined" ||
    typeof existing.getItem !== "function"
  ) {
    const store = new Map<string, string>();

    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) =>
          void store.set(key, String(value)),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
      },
    });
  }
}

// jsdom has no layout; Headless UI positions its popovers with this.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Loaded after the storage fallback above because i18n reads localStorage at import time.
const { default: i18n } = await import("../i18n");

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  // The address is part of what the app keeps, so every test starts at the lobby.
  window.history.replaceState(null, "", "/");
  await i18n.changeLanguage("en");
});
