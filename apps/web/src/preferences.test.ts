import { describe, expect, it, vi } from "vitest";

import {
  loadNotificationSound,
  loadSidebarOpen,
  loadShowMovements,
  saveNotificationSound,
  saveSidebarOpen,
  saveShowMovements,
} from "./preferences";

describe("showing who joins and leaves", () => {
  it("is off until the guest switches it on and remembers either choice", () => {
    expect(loadShowMovements()).toBe(false);

    saveShowMovements(false);
    expect(loadShowMovements()).toBe(false);

    saveShowMovements(true);
    expect(loadShowMovements()).toBe(true);
  });

  it("is off when what the browser holds is not what was saved", () => {
    localStorage.setItem("chatter.showMovements", "no");

    expect(loadShowMovements()).toBe(false);
  });

  it("is off when storage cannot be read, and saving does not fail", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });

    expect(loadShowMovements()).toBe(false);
    expect(() => saveShowMovements(false)).not.toThrow();
  });
});

describe("desktop sidebar", () => {
  it("defaults to open and remembers both states", () => {
    expect(loadSidebarOpen()).toBe(true);
    saveSidebarOpen(false);
    expect(loadSidebarOpen()).toBe(false);
    saveSidebarOpen(true);
    expect(loadSidebarOpen()).toBe(true);
  });

  it("defaults to open for invalid saved values", () => {
    localStorage.setItem("chatter.sidebarOpen", "invalid");
    expect(loadSidebarOpen()).toBe(true);
  });

  it("handles unavailable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(loadSidebarOpen()).toBe(true);
    expect(() => saveSidebarOpen(false)).not.toThrow();
  });
});

describe("private-message notification sound", () => {
  it("remembers independent categories and their sounds with a shared volume", () => {
    const value = {
      enabled: false,
      volume: 0.3,
      sound: "bell" as const,
      warnings: { enabled: true, sound: "pulse" as const },
      joins: { enabled: false, sound: "wood" as const },
    };
    saveNotificationSound(value);
    expect(loadNotificationSound()).toEqual(value);
  });

  it("rejects unknown sounds and malformed category settings", () => {
    for (const extra of [
      { sound: "unknown" },
      { warnings: { enabled: "yes", sound: "bell" } },
      { joins: { enabled: true, sound: "unknown" } },
    ]) {
      localStorage.setItem(
        "chatter.notificationSound",
        JSON.stringify({ enabled: true, volume: 0.5, ...extra }),
      );
      expect(loadNotificationSound()).toEqual({ enabled: false, volume: 0.5 });
    }
  });

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
