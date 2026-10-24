import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  error: vi.fn(),
}));
vi.mock("./payloadClient.js", () => ({ fetchWebsiteContent: mocks.fetch }));
vi.mock("./redis.js", () => ({ redis: { set: mocks.set, get: mocks.get } }));
vi.mock("./log.js", () => ({ log: { error: mocks.error } }));

import { getCachedWebsite, startWebsiteSync } from "./website.js";

let timer: ReturnType<typeof startWebsiteSync> | undefined;
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  clearInterval(timer);
});

describe("website cache", () => {
  it("distinguishes missing content from an empty published history", async () => {
    mocks.get.mockResolvedValue(null);
    expect(await getCachedWebsite()).toBeUndefined();
    mocks.get.mockResolvedValue(JSON.stringify({ roadmap: [], releases: [] }));
    expect(await getCachedWebsite()).toEqual({ roadmap: [], releases: [] });
  });

  it("replaces the snapshot only after a successful content fetch", async () => {
    const content = { roadmap: [], releases: [] };
    mocks.fetch.mockResolvedValue(content);
    timer = startWebsiteSync();
    await vi.waitFor(() =>
      expect(mocks.set).toHaveBeenCalledWith(
        "chatter:website",
        JSON.stringify(content),
      ),
    );
    expect(mocks.set.mock.calls[0]).toHaveLength(2);
  });

  it("retains the last good snapshot when Payload is unavailable", async () => {
    mocks.fetch.mockRejectedValue(new Error("admin unavailable"));
    timer = startWebsiteSync();
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
