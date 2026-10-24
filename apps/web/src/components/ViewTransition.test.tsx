import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewTransition } from "./ViewTransition";

beforeEach(() => {
  vi.mocked(window.scrollTo).mockClear();
});

describe("page transition scrolling", () => {
  it.each([
    ["lobby", 0, "about", 1],
    ["about", 1, "privacy", 1],
    ["privacy", 1, "lobby", 0],
    ["room:general", 1, "about", 1],
  ])(
    "starts %s (depth %i) -> %s (depth %i) at the top",
    (from, fromDepth, to, toDepth) => {
      const { rerender } = render(
        <ViewTransition viewKey={from} depth={fromDepth}>
          <p>Outgoing</p>
        </ViewTransition>,
      );
      expect(window.scrollTo).not.toHaveBeenCalled();

      rerender(
        <ViewTransition viewKey={to} depth={toDepth}>
          <p>Incoming</p>
        </ViewTransition>,
      );

      expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
        top: 0,
        behavior: "instant",
      });
    },
  );

  it("does not reset scrolling when arriving in chat", () => {
    const { rerender } = render(
      <ViewTransition viewKey="lobby" depth={0}>
        <p>Lobby</p>
      </ViewTransition>,
    );
    rerender(
      <ViewTransition viewKey="room:general" depth={1} resetScroll={false}>
        <p>Chat</p>
      </ViewTransition>,
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("does not move the page during updates to the same view", () => {
    const { rerender } = render(
      <ViewTransition viewKey="about" depth={1}>
        <p>About</p>
      </ViewTransition>,
    );
    rerender(
      <ViewTransition viewKey="about" depth={1}>
        <p>Updated about page</p>
      </ViewTransition>,
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("disables native history restoration only while the app owns scrolling", () => {
    window.history.scrollRestoration = "auto";
    const { unmount } = render(
      <ViewTransition viewKey="about" depth={1}>
        <p>About</p>
      </ViewTransition>,
    );
    expect(window.history.scrollRestoration).toBe("manual");
    unmount();
    expect(window.history.scrollRestoration).toBe("auto");
  });
});
