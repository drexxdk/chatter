import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, set, fetchModeratorNames } = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  fetchModeratorNames: vi.fn(),
}));

vi.mock("./redis.js", () => ({ redis: { get, set } }));
vi.mock("./payloadClient.js", () => ({ fetchModeratorNames }));

const {
  getModeratorNames,
  isReservedNickname,
  normalizeName,
  startModeratorNamesSync,
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

describe("getModeratorNames", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("is empty when nothing is cached", async () => {
    get.mockResolvedValue(null);

    expect(await getModeratorNames()).toEqual([]);
  });

  it("returns the cached names", async () => {
    get.mockResolvedValue(JSON.stringify(["Ada Mod", "Grace"]));

    expect(await getModeratorNames()).toEqual(["Ada Mod", "Grace"]);
    expect(get).toHaveBeenCalledWith("chatter:moderator-names");
  });

  it("propagates a cache failure so the handshake can fail closed", async () => {
    get.mockRejectedValue(new Error("redis down"));

    await expect(getModeratorNames()).rejects.toThrow("redis down");
  });
});

describe("startModeratorNamesSync", () => {
  const timers: NodeJS.Timeout[] = [];
  const start = () => {
    const timer = startModeratorNamesSync();
    timers.push(timer);
  };

  beforeEach(() => {
    set.mockReset().mockResolvedValue("OK");
    fetchModeratorNames.mockReset();
  });

  afterEach(() => {
    timers.splice(0).forEach(clearInterval);
    vi.restoreAllMocks();
  });

  it("caches the names straight away", async () => {
    fetchModeratorNames.mockResolvedValue(["Ada Mod"]);

    start();

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        "chatter:moderator-names",
        JSON.stringify(["Ada Mod"]),
      ),
    );
  });

  it("keeps the cache it has when Payload cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchModeratorNames.mockRejectedValue(new Error("payload down"));

    start();

    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(set).not.toHaveBeenCalled();
  });
});
