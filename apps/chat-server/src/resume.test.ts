import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn() }));

vi.mock("./redis.js", () => ({ redis }));

const { RESUME_TTL_SECONDS, newResumeSecret, rememberResume, verifyResume } =
  await import("./resume.js");

const sha256 = async (value: string) =>
  (await import("node:crypto"))
    .createHash("sha256")
    .update(value)
    .digest("hex");

beforeEach(() => {
  redis.set.mockReset().mockResolvedValue("OK");
  redis.get.mockReset().mockResolvedValue(null);
});

describe("newResumeSecret", () => {
  it("is long and random, so it cannot be guessed", () => {
    const first = newResumeSecret();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(newResumeSecret()).not.toBe(first);
  });
});

describe("rememberResume", () => {
  // A copy of what is in Redis must not be enough to take somebody over.
  it("keeps only a hash of the secret, for an hour", async () => {
    await rememberResume("guest-1", "the-secret");

    expect(redis.set).toHaveBeenCalledWith(
      "chatter:resume:guest-1",
      await sha256("the-secret"),
      "EX",
      3600,
    );
    expect(RESUME_TTL_SECONDS).toBe(3600);
    expect(JSON.stringify(redis.set.mock.calls)).not.toContain("the-secret");
  });
});

describe("verifyResume", () => {
  it("accepts the secret that was remembered for that guest", async () => {
    redis.get.mockResolvedValue(await sha256("the-secret"));

    expect(await verifyResume("guest-1", "the-secret")).toBe(true);
    expect(redis.get).toHaveBeenCalledWith("chatter:resume:guest-1");
  });

  it("refuses another secret", async () => {
    redis.get.mockResolvedValue(await sha256("the-secret"));

    expect(await verifyResume("guest-1", "another-secret")).toBe(false);
  });

  it("refuses a guest nothing is remembered for, or whose time has run out", async () => {
    expect(await verifyResume("guest-1", "the-secret")).toBe(false);
  });

  it.each([
    ["an empty id", "", "the-secret"],
    ["an empty secret", "guest-1", ""],
    ["a very long id", "x".repeat(200), "the-secret"],
    ["a very long secret", "guest-1", "x".repeat(500)],
  ])("does not even look up %s", async (_label, guestId, secret) => {
    expect(await verifyResume(guestId, secret)).toBe(false);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("propagates a Redis failure, so the connection can fail closed", async () => {
    redis.get.mockRejectedValue(new Error("redis down"));

    await expect(verifyResume("guest-1", "the-secret")).rejects.toThrow(
      "redis down",
    );
  });
});
