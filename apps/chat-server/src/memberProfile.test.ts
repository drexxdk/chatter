import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "./memberProfile.js";

vi.mock("./env.js", () => ({ env: {} }));
vi.mock("./redis.js", () => ({ redis: {} }));
vi.mock("./log.js", () => ({ log: { error: vi.fn() } }));
vi.mock("./members.js", () => ({
  isMemberName: vi.fn(),
  cacheMemberNames: vi.fn(),
}));
vi.mock("./payloadClient.js", () => ({
  updateUser: vi.fn(),
  isTaken: vi.fn(),
}));
vi.mock("./names.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./names.js")>()),
  getModeratorNames: vi.fn(),
}));

const { validateProfileUpdate } = await import("./memberProfile.js");
const { isMemberName, cacheMemberNames } = await import("./members.js");
const { getModeratorNames } = await import("./names.js");
const { updateUser } = await import("./payloadClient.js");

const current = Object.freeze<Profile>({
  nickname: "Alice",
  avatar: "female",
  picture: "lorelei:abc12345",
  age: 30,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getModeratorNames).mockResolvedValue(["Ada Mod"]);
  vi.mocked(isMemberName).mockResolvedValue(false);
});

describe("shared profile validation", () => {
  const birthDate = `${new Date().getUTCFullYear() - 35}-01-01`;

  it("derives age from the birth date instead of a supplied age", async () => {
    expect(
      await validateProfileUpdate(current, { birthDate, age: 99 }, 5),
    ).toEqual({
      ok: true,
      profile: { ...current, birthDate, age: 35 },
    });
  });

  it("clears the birth date and age together", async () => {
    expect(
      await validateProfileUpdate(
        { ...current, birthDate },
        { birthDate: null },
        5,
      ),
    ).toEqual({
      ok: true,
      profile: { ...current, birthDate: undefined, age: undefined },
    });
  });

  it("does not allow a numeric age to override a saved birth date", async () => {
    expect(
      await validateProfileUpdate({ ...current, birthDate }, { age: 99 }, 5),
    ).toEqual({ ok: false, error: "invalid_profile" });
  });

  it.each(["2001-02-29", "2026-01-01", "1900-01-01", "", 35, undefined])(
    "refuses invalid birth date %j",
    async (birthDate) => {
      expect(await validateProfileUpdate(current, { birthDate }, 5)).toEqual({
        ok: false,
        error: "invalid_profile",
      });
    },
  );

  it("merges and normalizes a valid update without changing its input", async () => {
    expect(
      await validateProfileUpdate(
        current,
        {
          nickname: " Alicia ",
          avatar: "trans",
          picture: "thumbs:zzzz9999",
          age: null,
        },
        5,
      ),
    ).toEqual({
      ok: true,
      profile: {
        nickname: "Alicia",
        avatar: "trans",
        picture: "thumbs:zzzz9999",
        age: undefined,
      },
    });
    expect(current).toEqual({
      nickname: "Alice",
      avatar: "female",
      picture: "lorelei:abc12345",
      age: 30,
    });
    expect(isMemberName).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "ignored", 42, [], {}])(
    "preserves omitted profile fields for %j",
    async (payload) => {
      expect(await validateProfileUpdate(current, payload, 5)).toEqual({
        ok: true,
        profile: current,
      });
      expect(getModeratorNames).not.toHaveBeenCalled();
      expect(isMemberName).not.toHaveBeenCalled();
    },
  );

  it("accepts private username changes only for members", async () => {
    expect(
      await validateProfileUpdate(current, { username: " other " }, 5),
    ).toEqual({ ok: true, profile: { ...current, username: "other" } });
    expect(await validateProfileUpdate(current, { username: "other" })).toEqual(
      { ok: false, error: "forbidden" },
    );
    expect(current).not.toHaveProperty("username");
  });

  it.each([
    [{ nickname: "a" }, "invalid_nickname"],
    [{ nickname: null }, "invalid_nickname"],
    [{ nickname: undefined }, "invalid_nickname"],
    [{ nickname: 42 }, "invalid_nickname"],
    [{ avatar: "robot" }, "invalid_profile"],
    [{ avatar: null }, "invalid_profile"],
    [{ avatar: undefined }, "invalid_profile"],
    [{ picture: "robot:abc12345" }, "invalid_profile"],
    [{ picture: "lorelei:../x" }, "invalid_profile"],
    [{ picture: null }, "invalid_profile"],
    [{ picture: 42 }, "invalid_profile"],
    [{ age: 17 }, "invalid_profile"],
    [{ age: 100 }, "invalid_profile"],
    [{ age: 30.5 }, "invalid_profile"],
    [{ age: "30" }, "invalid_profile"],
    [{ age: undefined }, "invalid_profile"],
    [{ nickname: "Alicia", avatar: "male", age: 17 }, "invalid_profile"],
  ])("refuses %j without saving any fields", async (payload, error) => {
    expect(await validateProfileUpdate(current, payload, 5)).toEqual({
      ok: false,
      error,
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(cacheMemberNames).not.toHaveBeenCalled();
  });

  it.each([18, 99, null])(
    "accepts age %j and retains the other fields",
    async (age) => {
      expect(await validateProfileUpdate(current, { age }, 5)).toEqual({
        ok: true,
        profile: { ...current, age: age === null ? undefined : age },
      });
    },
  );

  it.each(["male", "female", "trans", "other"])(
    "accepts the %s avatar",
    async (avatar) => {
      expect(await validateProfileUpdate(current, { avatar }, 5)).toEqual({
        ok: true,
        profile: { ...current, avatar },
      });
    },
  );

  it("accepts another user's display name, including a moderator's", async () => {
    expect(
      await validateProfileUpdate(current, { nickname: "Ada Mod" }, 5),
    ).toEqual({ ok: true, profile: { ...current, nickname: "Ada Mod" } });
    expect(getModeratorNames).not.toHaveBeenCalled();
    expect(isMemberName).not.toHaveBeenCalled();
  });

  it.each(["moderator", "system"])(
    "refuses the reserved name %s",
    async (nickname) => {
      expect(await validateProfileUpdate(current, { nickname }, 5)).toEqual({
        ok: false,
        error: "reserved_nickname",
      });
    },
  );

  it.each([undefined, 5])(
    "does not reserve display names for member %j",
    async (memberId) => {
      vi.mocked(isMemberName).mockResolvedValueOnce(true);
      expect(
        await validateProfileUpdate(current, { nickname: "Bobby" }, memberId),
      ).toEqual({ ok: true, profile: { ...current, nickname: "Bobby" } });
      expect(isMemberName).not.toHaveBeenCalled();
    },
  );

  it("does not repeat name lookups for an unchanged name", async () => {
    expect(
      await validateProfileUpdate(current, { nickname: "Alice" }, 5),
    ).toEqual({ ok: true, profile: current });
    expect(getModeratorNames).not.toHaveBeenCalled();
    expect(isMemberName).not.toHaveBeenCalled();
  });

  it("does not depend on name lookups being available", async () => {
    vi.mocked(getModeratorNames).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(isMemberName).mockRejectedValueOnce(new Error("offline"));
    expect(
      await validateProfileUpdate(current, { nickname: "Alicia" }, 5),
    ).toEqual({ ok: true, profile: { ...current, nickname: "Alicia" } });
    expect(getModeratorNames).not.toHaveBeenCalled();
    expect(isMemberName).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
