import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";

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

// The message box is an editor, which asks where text is on the screen; jsdom has no layout to tell it.
const noRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
};
Range.prototype.getBoundingClientRect ??= () => noRect as DOMRect;
Range.prototype.getClientRects ??= () =>
  ({ length: 0, item: () => null }) as unknown as DOMRectList;
document.elementFromPoint ??= () => null;

// The message box is an editor, not a field with a value: what is in it is read from what it shows (a line break as one,
// a mention as its name), and whether it can be written in from what it says about itself.
function draftOf(box: Element): string {
  const copy = box.cloneNode(true) as Element;
  copy
    .querySelectorAll("br.ProseMirror-trailingBreak")
    .forEach((br) => br.remove());
  copy.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));

  return copy.textContent ?? "";
}

expect.extend({
  toHaveDraft(box: Element, expected: string) {
    const actual = draftOf(box);

    return {
      pass: actual === expected,
      message: () =>
        `expected the message box to hold ${JSON.stringify(expected)}, but it holds ${JSON.stringify(actual)}`,
      actual,
      expected,
    };
  },
  toBeLocked(box: Element) {
    const pass = box.getAttribute("aria-disabled") === "true";

    return {
      pass,
      message: () =>
        `expected the message box ${pass ? "not " : ""}to be locked`,
    };
  },
});

declare module "vitest" {
  interface Assertion {
    toHaveDraft(expected: string): void;
    toBeLocked(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveDraft(expected: string): void;
    toBeLocked(): void;
  }
}
// The emoji picker is a web component with its own styles and a large file of data, which neither jsdom nor these tests
// have a use for: it is stood in for by three emoji, which are what its search finds as well, and what the app gives it
// can be looked at through `Picker`'s calls.
const EMOJI = [
  { id: "grinning", name: "Grinning Face", native: "😀" },
  { id: "fire", name: "Fire", native: "🔥" },
  { id: "pizza", name: "Pizza", native: "🍕" },
];

vi.mock("@emoji-mart/data", () => ({ default: {} }));
vi.mock("emoji-mart", () => ({
  init: vi.fn(async () => {}),
  FrequentlyUsed: { add: vi.fn() },
  SearchIndex: {
    search: vi.fn(async (query: string) =>
      EMOJI.filter((emoji) =>
        emoji.name.toLowerCase().includes(query.toLowerCase()),
      ).map(({ id, name, native }) => ({ id, name, skins: [{ native }] })),
    ),
  },
  Picker: vi.fn(function (props: {
    onEmojiSelect: (emoji: { native: string }) => void;
  }) {
    const element = document.createElement("div");

    for (const { native } of EMOJI) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", native);
      button.textContent = native;
      button.addEventListener("click", () => props.onEmojiSelect({ native }));
      element.append(button);
    }

    return element;
  }),
}));
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
