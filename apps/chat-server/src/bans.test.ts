import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("./redis.js", () => ({ redis: { get, set: vi.fn() } }));

const { isBanned } = await import("./bans.js");

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
