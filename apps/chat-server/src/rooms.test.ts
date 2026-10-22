import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchPublicRooms: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
}));
vi.mock("./payloadClient.js", () => ({
  fetchPublicRooms: mocks.fetchPublicRooms,
}));
vi.mock("./redis.js", () => ({ redis: { set: mocks.set, get: mocks.get } }));
vi.mock("./env.js", () => ({ env: { SYNC_INTERVAL_MS: 1000 } }));
vi.mock("./log.js", () => ({ log: { error: vi.fn() } }));

import { startPublicRoomsSync } from "./rooms.js";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchPublicRooms
    .mockReset()
    .mockResolvedValue([{ id: 1, slug: "general", name: "General" }]);
  mocks.set.mockReset().mockResolvedValue("OK");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("public room metadata notifications", () => {
  it("notifies after caching a new snapshot, but not for unchanged syncs", async () => {
    const changed = vi.fn(() => expect(mocks.set).toHaveBeenCalled());
    startPublicRoomsSync(changed);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(1);
    mocks.fetchPublicRooms.mockResolvedValue([
      { id: 1, slug: "general", name: "Renamed" },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(2);
    mocks.fetchPublicRooms.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("does not announce a snapshot that failed to cache and retries next sync", async () => {
    mocks.set.mockRejectedValueOnce(new Error("Redis unavailable"));
    const changed = vi.fn();
    startPublicRoomsSync(changed);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
