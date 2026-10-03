import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Newer Node versions define their own experimental `localStorage` global, which hides jsdom's and is
// undefined without --localstorage-file. Browsers are unaffected, so only the tests need this.
if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

// Loaded after the storage fallback above because i18n reads localStorage at import time.
const { default: i18n } = await import("../i18n");

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  await i18n.changeLanguage("en");
});
