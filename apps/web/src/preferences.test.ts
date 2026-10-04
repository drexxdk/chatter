import { describe, expect, it, vi } from "vitest";

import { loadShowMovements, saveShowMovements } from "./preferences";

describe("showing who joins and leaves", () => {
  it("is on until the guest switches it off", () => {
    expect(loadShowMovements()).toBe(true);

    saveShowMovements(false);
    expect(loadShowMovements()).toBe(false);

    saveShowMovements(true);
    expect(loadShowMovements()).toBe(true);
  });

  it("is on when what the browser holds is not what was saved", () => {
    localStorage.setItem("chatter.showMovements", "no");

    expect(loadShowMovements()).toBe(true);
  });

  it("is on when storage cannot be read, and saving does not fail", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });

    expect(loadShowMovements()).toBe(true);
    expect(() => saveShowMovements(false)).not.toThrow();
  });
});
