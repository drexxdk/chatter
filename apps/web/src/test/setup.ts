import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, expect, vi } from "vitest";

// A view that fades and slides away would still be on the page when a test looks for what replaced it.
MotionGlobalConfig.skipAnimations = true;

// The default of one second is too short for findBy and waitFor when every test file runs at once on a busy machine.
configure({ asyncUtilTimeout: 10_000 });

// A test is one tab; the tests of the tabs agreeing give the app a channel of their own.
Reflect.deleteProperty(globalThis, "BroadcastChannel");

// Use jsdom's browser storage without invoking Node's experimental storage getters.
const { jsdom } = globalThis as unknown as { jsdom: { window: Window } };
for (const name of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: jsdom.window[name],
  });
}

window.scrollTo = vi.fn();
HTMLMediaElement.prototype.play = vi.fn(async () => {});
HTMLMediaElement.prototype.pause = vi.fn();

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
// The emoji picker draws a large file of data in a list that needs a layout, which neither jsdom nor these tests have
// a use for: it is stood in for by three emoji, which are what its search finds as well, and what the app gives it can be
// looked at through the calls to `Root`.
const EMOJI = [
  { id: "grinning", name: "Grinning Face", native: "😀" },
  { id: "fire", name: "Fire", native: "🔥" },
  { id: "pizza", name: "Pizza", native: "🍕" },
];

vi.mock("emoji-picker-react/primitives", async () => {
  const React = await import("react");
  type Labels = {
    searchLabel?: string;
    searchPlaceholder?: string;
    searchResultsNone?: string;
  };
  const State = React.createContext({
    query: "",
    setQuery: (_value: string) => {},
    labels: {} as Labels,
    pick: (_emoji: string) => {},
  });
  const h = React.createElement;
  const matches = (query: string) =>
    EMOJI.filter((emoji) =>
      emoji.name.toLowerCase().includes(query.toLowerCase()),
    );

  return {
    Root: vi.fn(function Root(props: {
      children: React.ReactNode;
      labels?: Labels;
      onEmojiClick: (data: { emoji: string }) => void;
    }) {
      const [query, setQuery] = React.useState("");

      return h(
        State.Provider,
        {
          value: {
            query,
            setQuery,
            labels: props.labels ?? {},
            pick: (emoji: string) => props.onEmojiClick({ emoji }),
          },
        },
        h("div", null, props.children),
      );
    }),
    SearchInput: function SearchInput(props: {
      as: React.ComponentType<Record<string, unknown>>;
    }) {
      const { query, setQuery, labels } = React.useContext(State);

      return h(props.as, {
        type: "search",
        value: query,
        onChange: (event: { target: { value: string } }) =>
          setQuery(event.target.value),
        "aria-label": labels.searchLabel,
        placeholder: labels.searchPlaceholder,
      });
    },
    Viewport: (props: { children: React.ReactNode }) =>
      h("div", null, props.children),
    List: function List() {
      const { query, pick } = React.useContext(State);

      return h(
        "div",
        null,
        matches(query).map(({ id, native }) =>
          h(
            "button",
            {
              key: id,
              type: "button",
              "aria-label": native,
              onClick: () => pick(native),
            },
            native,
          ),
        ),
      );
    },
    Empty: function Empty() {
      const { query, labels } = React.useContext(State);

      return query && matches(query).length === 0
        ? h("p", { role: "status" }, labels.searchResultsNone)
        : null;
    },
    Loading: () => null,
    LoadError: () => null,
    CategoryNav: () => null,
  };
}); // Drawing an account's picture takes a library and the file of a style, which these tests have no use for: a picture is
// stood in for by an address that names it, at once.
vi.mock("../chat/pictureImage", () => {
  const uriOf = (picture: string | undefined) =>
    picture ? `data:image/svg+xml,${encodeURIComponent(picture)}` : undefined;

  return {
    drawPicture: vi.fn(async () => {}),
    pictureUri: uriOf,
    usePictureUri: uriOf,
  };
});
// Loaded after the storage fallback above because i18n reads localStorage at import time.
const { default: i18n } = await import("../i18n");
const { saveTermsAccepted } = await import("../preferences");
const { forgetAuthProviders } = await import("../api");

// Most tests are about the chat, not about the terms: they start from a browser that has accepted them.
saveTermsAccepted(null);

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  saveTermsAccepted(null);
  // Every test's page asks the chat-server which providers it has.
  forgetAuthProviders();
  sessionStorage.clear();
  for (const entry of document.cookie.split("; ")) {
    document.cookie = `${entry.split("=")[0]}=; Max-Age=0; Path=/`;
  }
  // The address is part of what the app keeps, so every test starts at the lobby.
  window.history.replaceState(null, "", "/");
  await i18n.changeLanguage("en");
});
