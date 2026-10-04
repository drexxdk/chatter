import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const chain = {
    rpush: (...args: unknown[]) => (calls.push(["rpush", ...args]), chain),
    ltrim: (...args: unknown[]) => (calls.push(["ltrim", ...args]), chain),
    expire: (...args: unknown[]) => (calls.push(["expire", ...args]), chain),
    exec: vi.fn(),
  };

  return {
    calls,
    chain,
    multi: vi.fn(() => chain),
    lrange: vi.fn(),
    eval: vi.fn(),
  };
});

vi.mock("./redis.js", () => ({
  redis: { multi: redis.multi, lrange: redis.lrange, eval: redis.eval },
}));

const { getHistory, recordMessage, redactMessagesFrom } =
  await import("./history.js");

// What clients get.
const message = (n: number, roomSlug = "general") => ({
  id: `id-${n}`,
  roomSlug,
  guestId: `guest-${n}`,
  nickname: "Alice",
  role: "guest" as const,
  text: `hello ${n}`,
  sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, n)).toISOString(),
});

// What is kept: the same plus who sent it, which only the server may know.
const stored = (n: number, roomSlug = "general") => ({
  ...message(n, roomSlug),
  ipHash: `hash-${n}`,
});

const replaced = (n: number, roomSlug = "general") => ({
  id: `id-${n}`,
  roomSlug,
  sentAt: message(n, roomSlug).sentAt,
  banned: true as const,
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
  redis.eval.mockReset().mockResolvedValue([]);
});

describe("recordMessage", () => {
  it("appends the message, keeps the newest 50 and refreshes the expiry, in one transaction", async () => {
    await recordMessage(stored(1));

    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(redis.chain.exec).toHaveBeenCalledTimes(1);
    expect(redis.calls).toEqual([
      ["rpush", "chatter:history:general", JSON.stringify(stored(1))],
      ["ltrim", "chatter:history:general", -50, -1],
      ["expire", "chatter:history:general", 3600],
    ]);
  });

  it("keeps each room's history under its own key", async () => {
    await recordMessage(stored(1, "random"));

    expect(redis.calls[0]?.[1]).toBe("chatter:history:random");
  });

  it("fails when Redis rejects one of the commands", async () => {
    redis.chain.exec.mockResolvedValue([
      [null, 1],
      [new Error("WRONGTYPE"), null],
      [null, 1],
    ]);

    await expect(recordMessage(stored(1))).rejects.toThrow(/WRONGTYPE/);
  });

  it("fails when the transaction was discarded", async () => {
    redis.chain.exec.mockResolvedValue(null);

    await expect(recordMessage(stored(1))).rejects.toThrow();
  });
});

describe("getHistory", () => {
  it("returns the stored messages oldest first", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify(stored(1)),
      JSON.stringify(stored(2)),
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
      JSON.stringify(stored(1)),
      "{not json",
      JSON.stringify({ id: "x", text: "no sender" }),
      JSON.stringify({ ...stored(3), sentAt: "yesterday" }),
      // Written before senders were recorded: it could not be replaced after a ban, so it is not shown at all.
      JSON.stringify(message(5)),
      JSON.stringify(stored(4)),
    ]);

    expect((await getHistory("general")).map((m) => m.id)).toEqual([
      "id-1",
      "id-4",
    ]);
  });

  it("keeps the sender's role, so moderators can be shown as such", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify({ ...stored(1), role: "moderator", ipHash: "" }),
    ]);

    expect(await getHistory("general")).toEqual([
      { ...message(1), role: "moderator" },
    ]);
  });

  it("treats a message stored without a role as a guest's", async () => {
    const { role: _role, ...withoutRole } = stored(1);
    redis.lrange.mockResolvedValue([JSON.stringify(withoutRole)]);

    expect(await getHistory("general")).toEqual([message(1)]);
  });

  it("skips a message with a role it does not know", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify({ ...stored(1), role: "overlord" }),
      JSON.stringify(stored(2)),
    ]);

    expect((await getHistory("general")).map((m) => m.id)).toEqual(["id-2"]);
  });

  it("never returns who sent a message", async () => {
    redis.lrange.mockResolvedValue([JSON.stringify(stored(1))]);

    const [first] = await getHistory("general");

    expect(first).toEqual(message(1));
    expect(first).not.toHaveProperty("ipHash");
  });

  it("returns a replaced message as a bare placeholder, in its place", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify(stored(1)),
      JSON.stringify(replaced(2)),
      JSON.stringify(stored(3)),
    ]);

    expect(await getHistory("general")).toEqual([
      message(1),
      replaced(2),
      message(3),
    ]);
  });

  it("does not let a placeholder carry the author or the text", async () => {
    redis.lrange.mockResolvedValue([
      JSON.stringify({
        ...replaced(2),
        text: "kept",
        nickname: "Mallory",
        ipHash: "h",
      }),
    ]);

    expect(await getHistory("general")).toEqual([replaced(2)]);
  });
});

describe("redactMessagesFrom", () => {
  it("runs one script on the room's list with the banned hashes", async () => {
    redis.eval.mockResolvedValue(["id-1", "id-3"]);

    expect(await redactMessagesFrom("general", ["h1", "h2"])).toEqual([
      "id-1",
      "id-3",
    ]);

    expect(redis.eval).toHaveBeenCalledTimes(1);
    const [script, keys, ...args] = redis.eval.mock.calls[0];
    expect(typeof script).toBe("string");
    expect(keys).toBe(1);
    expect(args).toEqual(["chatter:history:general", "h1", "h2"]);
  });

  // The script rewrites the list in place, so it must also be atomic with new messages arriving.
  it("does the whole job in the script, not in separate commands", async () => {
    await redactMessagesFrom("general", ["h1"]);

    expect(redis.lrange).not.toHaveBeenCalled();
    expect(redis.multi).not.toHaveBeenCalled();
  });

  it("does nothing without hashes", async () => {
    expect(await redactMessagesFrom("general", [])).toEqual([]);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("propagates a Redis failure", async () => {
    redis.eval.mockRejectedValue(new Error("redis down"));

    await expect(redactMessagesFrom("general", ["h1"])).rejects.toThrow(
      "redis down",
    );
  });

  it("rejects an unexpected answer instead of trusting it", async () => {
    redis.eval.mockResolvedValue("OK");

    await expect(redactMessagesFrom("general", ["h1"])).rejects.toThrow();
  });
});
