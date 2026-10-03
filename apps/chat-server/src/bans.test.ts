import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, set, fetchBans } = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  fetchBans: vi.fn(),
}));

vi.mock("./redis.js", () => ({ redis: { get, set } }));
vi.mock("./payloadClient.js", () => ({ fetchBans }));

const { isBanned, startBansSync } = await import("./bans.js");

const HOUR = 60 * 60 * 1000;

function cacheBans(bans: unknown[]) {
  get.mockResolvedValue(JSON.stringify(bans));
}

describe("isBanned", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("is false when nothing is cached", async () => {
    get.mockResolvedValue(null);

    expect(await isBanned("abc")).toBe(false);
  });

  it("is true for a permanent ban", async () => {
    cacheBans([{ id: 1, identifierHash: "abc" }]);

    expect(await isBanned("abc")).toBe(true);
  });

  it("is false for a different identifier", async () => {
    cacheBans([{ id: 1, identifierHash: "abc" }]);

    expect(await isBanned("other")).toBe(false);
  });

  it("is true until a temporary ban expires", async () => {
    cacheBans([
      {
        id: 1,
        identifierHash: "abc",
        expiresAt: new Date(Date.now() + HOUR).toISOString(),
      },
    ]);

    expect(await isBanned("abc")).toBe(true);
  });

  it("is false once a temporary ban has expired", async () => {
    cacheBans([
      {
        id: 1,
        identifierHash: "abc",
        expiresAt: new Date(Date.now() - HOUR).toISOString(),
      },
    ]);

    expect(await isBanned("abc")).toBe(false);
  });

  it("propagates cache failures so callers can fail closed", async () => {
    get.mockRejectedValue(new Error("redis down"));

    await expect(isBanned("abc")).rejects.toThrow("redis down");
  });
});

describe("startBansSync", () => {
  const timers: NodeJS.Timeout[] = [];

  const start = (onActive?: (hashes: string[]) => unknown) => {
    const timer = startBansSync(onActive as never);
    timers.push(timer);
    return timer;
  };

  beforeEach(() => {
    set.mockReset().mockResolvedValue("OK");
    fetchBans.mockReset();
  });

  afterEach(() => {
    timers.splice(0).forEach(clearInterval);
    vi.restoreAllMocks();
  });

  it("caches the bans and hands the active ones to the listener", async () => {
    const bans = [
      { id: 1, identifierHash: "permanent" },
      {
        id: 2,
        identifierHash: "until-later",
        expiresAt: new Date(Date.now() + HOUR).toISOString(),
      },
      {
        id: 3,
        identifierHash: "lapsed",
        expiresAt: new Date(Date.now() - HOUR).toISOString(),
      },
    ];
    fetchBans.mockResolvedValue(bans);
    const onActive = vi.fn();

    start(onActive);

    await vi.waitFor(() => expect(onActive).toHaveBeenCalledTimes(1));
    expect(onActive).toHaveBeenCalledWith(["permanent", "until-later"]);
    expect(set).toHaveBeenCalledWith("chatter:bans", JSON.stringify(bans));
  });

  it("lists a hash once however many bans it has", async () => {
    fetchBans.mockResolvedValue([
      { id: 1, identifierHash: "same" },
      { id: 2, identifierHash: "same" },
    ]);
    const onActive = vi.fn();

    start(onActive);

    await vi.waitFor(() => expect(onActive).toHaveBeenCalledWith(["same"]));
  });

  it("does not call the listener when nobody is banned", async () => {
    fetchBans.mockResolvedValue([
      {
        id: 1,
        identifierHash: "lapsed",
        expiresAt: new Date(Date.now() - HOUR).toISOString(),
      },
    ]);
    const onActive = vi.fn();

    start(onActive);

    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    expect(onActive).not.toHaveBeenCalled();
  });

  it("caches the bans before the listener runs", async () => {
    fetchBans.mockResolvedValue([{ id: 1, identifierHash: "abc" }]);
    const order: string[] = [];
    set.mockImplementation(async () => void order.push("cache"));

    start(async () => void order.push("listener"));

    await vi.waitFor(() => expect(order).toEqual(["cache", "listener"]));
  });

  it("keeps the cache and carries on when the listener fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchBans.mockResolvedValue([{ id: 1, identifierHash: "abc" }]);

    start(() => Promise.reject(new Error("boom")));

    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("works without a listener", async () => {
    fetchBans.mockResolvedValue([{ id: 1, identifierHash: "abc" }]);

    start();

    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));
  });
});
