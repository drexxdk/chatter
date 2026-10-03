import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const chain = {
    rpush: (...args: unknown[]) => (calls.push(["rpush", ...args]), chain),
    ltrim: (...args: unknown[]) => (calls.push(["ltrim", ...args]), chain),
    expire: (...args: unknown[]) => (calls.push(["expire", ...args]), chain),
    exec: vi.fn(),
  };

  return { calls, chain, multi: vi.fn(() => chain), lrange: vi.fn() };
});

vi.mock("./redis.js", () => ({
  redis: { multi: redis.multi, lrange: redis.lrange },
}));

const { getHistory, recordMessage } = await import("./history.js");

const message = (n: number, roomSlug = "general") => ({
  id: `id-${n}`,
  roomSlug,
  guestId: `guest-${n}`,
  nickname: "Alice",
  text: `hello ${n}`,
  sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, n)).toISOString(),
});

beforeEach(() => {
  redis.calls.length = 0;
  redis.multi.mockClear();
  redis.chain.exec.mockReset().mockResolvedValue([
    [null, 1],
    [null, "OK"],
    [null, 1],
  ]);
  redis.lrange.mockReset().mockResolvedValue([]);
});

describe("recordMessage", () => {
  it("appends the message, keeps the newest 50 and refreshes the expiry, in one transaction", async () => {
    await recordMessage(message(1));

    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(redis.chain.exec).toHaveBeenCalledTimes(1);
    expect(redis.calls).toEqual([
      ["rpush", "chatter:history:general", JSON.stringify(message(1))],
      ["ltrim", "chatter:history:general", -50, -1],
      ["expire", "chatter:history:general", 3600],
    ]);
  });

  it("keeps each room's history under its own key", async () => {
    await recordMessage(message(1, "random"));

    expect(redis.calls[0]?.[1]).toBe("chatter:history:random");
  });

  it("fails when Redis rejects one of the commands", async () => {
    redis.chain.exec.mockResolvedValue([
      [null, 1],
      [new Error("WRONGTYPE"), null],
      [null, 1],
    ]);

    await expect(recordMessage(message(1))).rejects.toThrow(/WRONGTYPE/);
  });

  it("fails when the transaction was discarded", async () => {
    redis.chain.exec.mockResolvedValue(null);

    await expect(recordMessage(message(1))).rejects.toThrow();
  });
});

describe("getHistory", () => {
  it("returns the stored messages oldest first", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify(message(1)),
      JSON.stringify(message(2)),
    ]);

    expect(await getHistory("general")).toEqual([message(1), message(2)]);
    expect(redis.lrange).toHaveBeenCalledWith("chatter:history:general", 0, -1);
  });

  it("returns nothing for a room without history", async () => {
    expect(await getHistory("general")).toEqual([]);
  });

  // One bad entry (an older version's shape, a truncated write) must not stop a guest from joining.
  it("skips entries that are not valid messages", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify(message(1)),
      "{not json",
      JSON.stringify({ id: "x", text: "no sender" }),
      JSON.stringify({ ...message(3), sentAt: "yesterday" }),
      JSON.stringify(message(4)),
    ]);

    expect((await getHistory("general")).map((m) => m.id)).toEqual([
      "id-1",
      "id-4",
    ]);
  });

  it("only returns the fields of a message", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify({ ...message(1), ipHash: "secret" }),
    ]);

    expect(await getHistory("general")).toEqual([message(1)]);
  });
});
