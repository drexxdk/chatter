import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withMemberNamesLock } from "./memberNamesLock.js";

// A Redis that keeps hashes, which is all the list of names uses.
const redisState = vi.hoisted(() => ({
  hashes: new Map<string, Map<string, string>>(),
}));
const fetchUserNames = vi.hoisted(() => vi.fn());

vi.mock("./env.js", () => ({ env: { SYNC_INTERVAL_MS: 100 } }));
vi.mock("./log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));
vi.mock("./payloadClient.js", () => ({ fetchUserNames }));
vi.mock("./redis.js", () => {
  const hash = (key: string) => {
    let existing = redisState.hashes.get(key);
    if (!existing) redisState.hashes.set(key, (existing = new Map()));
    return existing;
  };

  return {
    redis: {
      hget: async (key: string, field: string) =>
        redisState.hashes.get(key)?.get(field) ?? null,
      hsetnx: async (key: string, field: string, value: string) => {
        if (hash(key).has(field)) return 0;
        hash(key).set(field, value);
        return 1;
      },
      hdel: async (key: string, field: string) => {
        redisState.hashes.get(key)?.delete(field);
      },
      hset: async (key: string, ...pairs: string[]) => {
        for (let i = 0; i < pairs.length; i += 2) {
          hash(key).set(pairs[i] as string, pairs[i + 1] as string);
        }
      },
      del: async (key: string) => {
        redisState.hashes.delete(key);
      },
      rename: async (from: string, to: string) => {
        redisState.hashes.set(to, redisState.hashes.get(from) ?? new Map());
        redisState.hashes.delete(from);
      },
    },
  };
});

const {
  cacheMemberNames,
  claimMemberName,
  isMemberName,
  releaseMemberName,
  startMemberNamesSync,
} = await import("./members.js");
const { redis } = await import("./redis.js");
const { log } = await import("./log.js");

beforeEach(() => {
  redisState.hashes.clear();
  fetchUserNames.mockReset().mockResolvedValue([]);
  vi.mocked(log.error).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the nicknames of the accounts", () => {
  it("are taken by whoever claims them first, in any spelling", async () => {
    expect(await claimMemberName(1, "Alice")).toBe(true);
    expect(await claimMemberName(2, "a.l.i.c.e")).toBe(false);
    expect(await claimMemberName(1, "ALICE")).toBe(true);
  });

  it("are taken for everybody but their owner", async () => {
    await claimMemberName(1, "Alice");

    expect(await isMemberName("alice")).toBe(true);
    expect(await isMemberName("Alice", 2)).toBe(true);
    expect(await isMemberName("Alice", 1)).toBe(false);
    expect(await isMemberName("Bob")).toBe(false);
  });

  it("are given back, but only by the one that has them", async () => {
    await claimMemberName(1, "Alice");

    await releaseMemberName(2, "Alice");
    expect(await isMemberName("Alice")).toBe(true);

    await releaseMemberName(1, "Alice");
    expect(await isMemberName("Alice")).toBe(false);
  });
});

describe("caching names after an account write", () => {
  it("keeps the username while releasing only obsolete display names", async () => {
    await claimMemberName(1, "Alice");
    await claimMemberName(1, "Old Name");

    await cacheMemberNames(1, ["Alice", "New Name"], ["ALICE", "Old Name"]);

    expect(await isMemberName("Alice", 1)).toBe(false);
    expect(await isMemberName("Alice")).toBe(true);
    expect(await isMemberName("New Name")).toBe(true);
    expect(await isMemberName("Old Name")).toBe(false);
    expect(fetchUserNames).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("repairs a stale owner from the authoritative database", async () => {
    await claimMemberName(9, "Alice");
    fetchUserNames.mockResolvedValue([{ id: 1, nicknameKey: "alice" }]);

    await cacheMemberNames(1, ["Alice"]);

    expect(await isMemberName("Alice", 1)).toBe(false);
    expect(await isMemberName("Alice", 9)).toBe(true);
    expect(fetchUserNames).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("immediately rebuilds after a failed Redis claim", async () => {
    fetchUserNames.mockResolvedValue([
      { id: 1, nicknameKey: "alice", displayNameKey: "newname" },
    ]);
    vi.spyOn(redis, "hsetnx").mockRejectedValueOnce(
      new Error("Redis unavailable"),
    );

    await cacheMemberNames(1, ["Alice", "New Name"]);

    expect(await isMemberName("Alice")).toBe(true);
    expect(await isMemberName("New Name", 1)).toBe(false);
    expect(fetchUserNames).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("repairs a failed release after account deletion", async () => {
    await claimMemberName(1, "Alice");
    vi.spyOn(redis, "hdel").mockRejectedValueOnce(
      new Error("Redis unavailable"),
    );

    await cacheMemberNames(1, [], ["Alice"]);

    expect(await isMemberName("Alice")).toBe(false);
    expect(fetchUserNames).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("does not fail the saved write if repair fails and recovers on the next sync", async () => {
    vi.useFakeTimers();
    vi.spyOn(redis, "hsetnx").mockRejectedValueOnce(
      new Error("Redis unavailable"),
    );
    fetchUserNames.mockRejectedValueOnce(new Error("Payload unavailable"));

    await expect(cacheMemberNames(1, ["Alice"])).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(2);

    fetchUserNames.mockResolvedValue([{ id: 1, nicknameKey: "alice" }]);
    const timer = startMemberNamesSync();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(await isMemberName("Alice")).toBe(true);
    } finally {
      clearInterval(timer);
    }
  });
});

describe("keeping the list right", () => {
  it("passes complete account snapshots to access enforcement on every refresh", async () => {
    vi.useFakeTimers();
    const onMembers = vi.fn();
    fetchUserNames.mockResolvedValue([
      { id: 1, nicknameKey: "alice" },
      { id: 2, nicknameKey: "bob" },
    ]);

    const timer = startMemberNamesSync(onMembers);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(onMembers).toHaveBeenLastCalledWith([1, 2]);

      fetchUserNames.mockResolvedValue([{ id: 2, nicknameKey: "bob" }]);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onMembers).toHaveBeenLastCalledWith([2]);

      fetchUserNames.mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onMembers).toHaveBeenLastCalledWith([]);
      expect(onMembers).toHaveBeenCalledTimes(3);
    } finally {
      clearInterval(timer);
    }
  });

  it("does not revoke access when Payload cannot supply a complete snapshot", async () => {
    vi.useFakeTimers();
    const onMembers = vi.fn();
    fetchUserNames.mockRejectedValue(new Error("Payload unavailable"));

    const timer = startMemberNamesSync(onMembers);
    try {
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onMembers).not.toHaveBeenCalled();
    } finally {
      clearInterval(timer);
    }
  });

  it("enforces deleted accounts even if writing the Redis cache fails", async () => {
    vi.useFakeTimers();
    const onMembers = vi.fn();
    fetchUserNames.mockResolvedValue([{ id: 2, nicknameKey: "bob" }]);
    vi.spyOn(redis, "del").mockRejectedValueOnce(
      new Error("Redis unavailable"),
    );

    const timer = startMemberNamesSync(onMembers);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(onMembers).toHaveBeenCalledWith([2]);
    } finally {
      clearInterval(timer);
    }
  });

  it("keeps synchronizing names when access enforcement fails", async () => {
    vi.useFakeTimers();
    const onMembers = vi
      .fn()
      .mockRejectedValue(new Error("Socket unavailable"));
    fetchUserNames.mockResolvedValue([{ id: 1, nicknameKey: "alice" }]);

    const timer = startMemberNamesSync(onMembers);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(await isMemberName("Alice")).toBe(true);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to enforce member access",
        expect.any(Error),
      );
    } finally {
      clearInterval(timer);
    }
  });

  it("does not overlap refreshes or overwrite a claim with an older snapshot", async () => {
    vi.useFakeTimers();
    let finish!: (names: { id: number; nicknameKey: string }[]) => void;
    fetchUserNames.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const timer = startMemberNamesSync();
    await vi.advanceTimersByTimeAsync(0);
    const mutation = withMemberNamesLock(() => claimMemberName(2, "Bob"));

    try {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(fetchUserNames).toHaveBeenCalledTimes(1);
      finish([{ id: 1, nicknameKey: "alice" }]);
      await mutation;
      await vi.advanceTimersByTimeAsync(0);

      expect(await isMemberName("Alice")).toBe(true);
      expect(await isMemberName("Bob")).toBe(true);
      expect(await isMemberName("Bob", 2)).toBe(false);
    } finally {
      clearInterval(timer);
      finish([]);
      await mutation;
      await vi.advanceTimersByTimeAsync(0);
    }
  });

  it("replaces the list with what the accounts say, after a moment", async () => {
    vi.useFakeTimers();
    await claimMemberName(9, "Gone");
    fetchUserNames.mockResolvedValue([{ id: 1, nicknameKey: "alice" }]);

    const timer = startMemberNamesSync();
    await vi.advanceTimersByTimeAsync(0);
    clearInterval(timer);

    expect(await isMemberName("Alice")).toBe(true);
    expect(await isMemberName("Gone")).toBe(false);
  });

  it("keeps the display names too, for the same account", async () => {
    vi.useFakeTimers();
    fetchUserNames.mockResolvedValue([
      { id: 1, nicknameKey: "alicea", displayNameKey: "alicewonder" },
      { id: 2, nicknameKey: "bob" },
    ]);

    const timer = startMemberNamesSync();
    await vi.advanceTimersByTimeAsync(0);
    clearInterval(timer);

    expect(await isMemberName("Alice Wonder")).toBe(true);
    expect(await isMemberName("Alice Wonder", 1)).toBe(false);
    expect(await isMemberName("alice_a")).toBe(true);
    expect(await isMemberName("Bob")).toBe(true);
  });

  it("empties it when there are no accounts", async () => {
    vi.useFakeTimers();
    await claimMemberName(9, "Gone");

    const timer = startMemberNamesSync();
    await vi.advanceTimersByTimeAsync(0);
    clearInterval(timer);

    expect(await isMemberName("Gone")).toBe(false);
  });

  it("keeps what it had when Payload cannot be reached", async () => {
    vi.useFakeTimers();
    await claimMemberName(1, "Alice");
    fetchUserNames.mockRejectedValue(new Error("down"));

    const timer = startMemberNamesSync();
    await vi.advanceTimersByTimeAsync(0);
    clearInterval(timer);

    expect(await isMemberName("Alice")).toBe(true);
  });
});
