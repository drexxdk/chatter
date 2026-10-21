import { describe, expect, it, vi } from "vitest";

import {
  loadNotificationSound,
  loadShowMovements,
  saveNotificationSound,
  saveShowMovements,
} from "./preferences";

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

describe("private-message notification sound", () => {
  it("is disabled by default with half volume", () => {
    expect(loadNotificationSound()).toEqual({ enabled: false, volume: 0.5 });
  });

  it("remembers enabling, volume, muting and disabling", () => {
    for (const value of [
      { enabled: true, volume: 0.25 },
      { enabled: true, volume: 0 },
      { enabled: false, volume: 0.75 },
    ]) {
      saveNotificationSound(value);
      expect(loadNotificationSound()).toEqual(value);
    }
  });

  it.each(["not json", "null", "{}", '{"enabled":"true","volume":0.5}'])(
    "uses safe defaults for invalid settings: %s",
    (value) => {
      localStorage.setItem("chatter.notificationSound", value);
      expect(loadNotificationSound()).toEqual({ enabled: false, volume: 0.5 });
    },
  );

  it.each([
    [-1, 0],
    [2, 1],
  ])("clamps stored volume %s to %s", (volume, expected) => {
    saveNotificationSound({ enabled: true, volume });
    expect(loadNotificationSound()).toEqual({
      enabled: true,
      volume: expected,
    });
  });

  it("stays silent when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(loadNotificationSound()).toEqual({ enabled: false, volume: 0.5 });
    expect(() =>
      saveNotificationSound({ enabled: true, volume: 1 }),
    ).not.toThrow();
  });
});
