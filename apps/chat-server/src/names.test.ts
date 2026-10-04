import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, set, fetchModerators } = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  fetchModerators: vi.fn(),
}));

vi.mock("./redis.js", () => ({ redis: { get, set } }));
vi.mock("./payloadClient.js", () => ({ fetchModerators }));

const {
  getModeratorNames,
  getModerators,
  isReservedNickname,
  normalizeName,
  rememberModerator,
  startModeratorsSync,
} = await import("./names.js");

describe("normalizeName", () => {
  it.each([
    ["Ada Mod", "adamod"],
    ["ADA_MOD", "adamod"],
    ["ada.mod", "adamod"],
    ["ada-mod", "adamod"],
    ["  Ada   Mod ", "adamod"],
    // Full-width letters look different to a program and the same to a person.
    ["Ａda Ｍod", "adamod"],
  ])("turns %j into %j", (name, expected) => {
    expect(normalizeName(name)).toBe(expected);
  });
});

describe("isReservedNickname", () => {
  const moderators = ["Ada Mod", "Grace"];

  it.each([
    "Ada Mod",
    "ada mod",
    "ADA_MOD",
    "ada.mod",
    "adamod",
    "Ａda Ｍod",
    "Grace",
  ])("reserves %j, the name of a moderator", (nickname) => {
    expect(isReservedNickname(nickname, moderators)).toBe(true);
  });

  it.each([
    "Moderator",
    "moderator",
    "Admin",
    "ADMIN",
    "Administrator",
    "Site Admin",
    "Admin_Bob",
    "Chat Moderator",
    "Staff",
    "Support",
    "System",
    "Mod",
    "m o d",
  ])("reserves %j, a word that claims authority", (nickname) => {
    expect(isReservedNickname(nickname, [])).toBe(true);
  });

  it.each([
    "Alice",
    "Bob",
    "Modesty",
    "Commodore",
    "Padmini",
    "Admiral",
    "Graceful",
    "Ada",
  ])("leaves %j free", (nickname) => {
    expect(isReservedNickname(nickname, moderators)).toBe(false);
  });
});

const ADA = { id: 1, name: "Ada Mod" };
const GRACE = { id: 5, name: "Grace" };
const NAMELESS = { id: 2, name: null };

describe("getModeratorNames", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("is empty when nothing is cached", async () => {
    get.mockResolvedValue(null);

    expect(await getModeratorNames()).toEqual([]);
  });

  it("returns the cached names, leaving out accounts without one", async () => {
    get.mockResolvedValue(JSON.stringify([ADA, NAMELESS, GRACE]));

    expect(await getModeratorNames()).toEqual(["Ada Mod", "Grace"]);
    expect(get).toHaveBeenCalledWith("chatter:moderators");
  });

  it("propagates a cache failure so the handshake can fail closed", async () => {
    get.mockRejectedValue(new Error("redis down"));

    await expect(getModeratorNames()).rejects.toThrow("redis down");
  });
});

describe("getModerators", () => {
  beforeEach(() => {
    get.mockReset();
  });

  // Not the same as an empty list: that means nobody may moderate, this means nobody has checked yet.
  it("is undefined when the list has never been cached", async () => {
    get.mockResolvedValue(null);

    expect(await getModerators()).toBeUndefined();
  });

  it("returns the cached accounts, including an empty list", async () => {
    get.mockResolvedValue(JSON.stringify([ADA, NAMELESS]));
    expect(await getModerators()).toEqual([ADA, NAMELESS]);

    get.mockResolvedValue("[]");
    expect(await getModerators()).toEqual([]);
  });

  it("propagates a cache failure", async () => {
    get.mockRejectedValue(new Error("redis down"));

    await expect(getModerators()).rejects.toThrow("redis down");
  });
});

describe("rememberModerator", () => {
  beforeEach(() => {
    get.mockReset();
    set.mockReset().mockResolvedValue("OK");
  });

  it("adds an account the list does not have yet", async () => {
    get.mockResolvedValue(JSON.stringify([GRACE]));

    await rememberModerator(ADA);

    expect(set).toHaveBeenCalledWith(
      "chatter:moderators",
      JSON.stringify([GRACE, ADA]),
    );
  });

  it("updates an account it already has, rather than listing it twice", async () => {
    get.mockResolvedValue(JSON.stringify([ADA, GRACE]));

    await rememberModerator({ id: 1, name: "Ada Renamed" });

    expect(set).toHaveBeenCalledWith(
      "chatter:moderators",
      JSON.stringify([{ id: 1, name: "Ada Renamed" }, GRACE]),
    );
  });

  // Starting a list of one would turn every other moderator away until the first sync.
  it("leaves the list alone when it has never been read", async () => {
    get.mockResolvedValue(null);

    await rememberModerator(ADA);

    expect(set).not.toHaveBeenCalled();
  });

  it("propagates a cache failure", async () => {
    get.mockRejectedValue(new Error("redis down"));

    await expect(rememberModerator(ADA)).rejects.toThrow("redis down");
  });
});

describe("startModeratorsSync", () => {
  const timers: NodeJS.Timeout[] = [];
  const start = (listener?: (ids: number[]) => unknown) => {
    timers.push(startModeratorsSync(listener));
  };

  beforeEach(() => {
    set.mockReset().mockResolvedValue("OK");
    fetchModerators.mockReset();
  });

  afterEach(() => {
    timers.splice(0).forEach(clearInterval);
    vi.restoreAllMocks();
  });

  it("caches the accounts straight away", async () => {
    fetchModerators.mockResolvedValue([ADA]);

    start();

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        "chatter:moderators",
        JSON.stringify([ADA]),
      ),
    );
  });

  it("tells the listener who may moderate right now, once the list is cached", async () => {
    fetchModerators.mockResolvedValue([ADA, NAMELESS]);
    const listener = vi.fn();

    start(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([1, 2]));
    expect(set).toHaveBeenCalled();
  });

  // The last moderator being removed is exactly when the listener has to hear about it.
  it("tells the listener even when nobody may moderate any more", async () => {
    fetchModerators.mockResolvedValue([]);
    const listener = vi.fn();

    start(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([]));
  });

  it("keeps the cache and says nothing when Payload cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchModerators.mockRejectedValue(new Error("payload down"));
    const listener = vi.fn();

    start(listener);

    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(set).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not count a failing listener as a failed sync", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchModerators.mockResolvedValue([ADA]);

    start(() => {
      throw new Error("boom");
    });

    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(set).toHaveBeenCalledWith(
      "chatter:moderators",
      JSON.stringify([ADA]),
    );
    expect(error.mock.calls[0][0]).toMatch(/enforce/i);
  });
});
