import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  pttl: vi.fn(),
}));

vi.mock("./redis.js", () => ({ redis }));

const {
  ANNOUNCE_COOLDOWN_MS,
  ANNOUNCEMENT_TTL_SECONDS,
  claimAnnouncementSlot,
  getLatestAnnouncement,
  saveAnnouncement,
} = await import("./announcements.js");

const announcement = {
  id: "a-1",
  text: "The chat closes for maintenance at noon",
  sentAt: "2026-10-04T10:00:00.000Z",
  name: "Ada Mod",
};

beforeEach(() => {
  redis.set.mockReset().mockResolvedValue("OK");
  redis.get.mockReset().mockResolvedValue(null);
  redis.pttl.mockReset().mockResolvedValue(-2);
});

describe("limits", () => {
  it("lets a moderator announce once a minute, and the latest stays for an hour", () => {
    expect(ANNOUNCE_COOLDOWN_MS).toBe(60_000);
    expect(ANNOUNCEMENT_TTL_SECONDS).toBe(3600);
  });
});

describe("saveAnnouncement", () => {
  it("keeps only the latest announcement, for an hour", async () => {
    await saveAnnouncement(announcement);

    expect(redis.set).toHaveBeenCalledWith(
      "chatter:announcement",
      JSON.stringify(announcement),
      "EX",
      3600,
    );
  });
});

describe("getLatestAnnouncement", () => {
  it("returns what was saved", async () => {
    redis.get.mockResolvedValue(JSON.stringify(announcement));

    expect(await getLatestAnnouncement()).toEqual(announcement);
  });

  it("returns nothing when there is none, or it has expired", async () => {
    expect(await getLatestAnnouncement()).toBeUndefined();
  });

  it.each([
    ["not JSON", "{oops"],
    ["the wrong shape", JSON.stringify({ text: "no id" })],
  ])("ignores a stored value that is %s", async (_label, stored) => {
    redis.get.mockResolvedValue(stored);

    expect(await getLatestAnnouncement()).toBeUndefined();
  });

  it("drops fields it does not know", async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({ ...announcement, accountId: 7 }),
    );

    expect(await getLatestAnnouncement()).toEqual(announcement);
  });
});

describe("claimAnnouncementSlot", () => {
  it("lets a moderator announce when they have not for a minute", async () => {
    expect(await claimAnnouncementSlot(7)).toBe(0);

    expect(redis.set).toHaveBeenCalledWith(
      "chatter:announce-cooldown:7",
      "1",
      "PX",
      60_000,
      "NX",
    );
  });

  it("tells a moderator who announced a moment ago how long to wait", async () => {
    redis.set.mockResolvedValue(null);
    redis.pttl.mockResolvedValue(42_000);

    expect(await claimAnnouncementSlot(7)).toBe(42_000);
    expect(redis.pttl).toHaveBeenCalledWith("chatter:announce-cooldown:7");
  });

  // The key can expire between the two calls, or lose its expiry; waiting a full minute is the safe answer.
  it.each([-1, -2])(
    "falls back to the full wait when Redis cannot say (%i)",
    async (ttl) => {
      redis.set.mockResolvedValue(null);
      redis.pttl.mockResolvedValue(ttl);

      expect(await claimAnnouncementSlot(7)).toBe(60_000);
    },
  );

  it("counts each moderator separately", async () => {
    await claimAnnouncementSlot(7);
    await claimAnnouncementSlot(8);

    expect(redis.set.mock.calls.map((call) => call[0])).toEqual([
      "chatter:announce-cooldown:7",
      "chatter:announce-cooldown:8",
    ]);
  });
});
