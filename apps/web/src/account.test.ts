import { afterEach, describe, expect, it, vi } from "vitest";

import { clearAccount, loadAccount, saveAccount } from "./account";

const NOW = 1_700_000_000_000;
const account = {
  token: "member-token",
  provider: "google",
  nickname: "Alice",
  avatar: "female" as const,
  age: 30,
  expiresAt: NOW + 1000,
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the account kept in this browser", () => {
  it("is there after it was saved, and gone after it was cleared", () => {
    saveAccount(account);

    expect(loadAccount(NOW)).toEqual(account);

    clearAccount();

    expect(loadAccount(NOW)).toBeNull();
  });

  it("is nothing until somebody has signed in", () => {
    expect(loadAccount(NOW)).toBeNull();
  });

  it("is nothing once the token has run out", () => {
    saveAccount(account);

    expect(loadAccount(NOW + 1000)).toBeNull();
  });

  it("keeps the avatar and the age only when they are valid", () => {
    saveAccount({ ...account, avatar: "robot" as never, age: 7 });

    expect(loadAccount(NOW)).toEqual({
      token: "member-token",
      provider: "google",
      nickname: "Alice",
      expiresAt: NOW + 1000,
    });
  });

  it.each([
    ["not JSON", "{"],
    ["null", "null"],
    ["a list", "[]"],
    ["without a token", JSON.stringify({ ...account, token: "" })],
    ["without a nickname", JSON.stringify({ ...account, nickname: "" })],
    ["without an expiry", JSON.stringify({ ...account, expiresAt: "soon" })],
    ["with a token that is not text", JSON.stringify({ ...account, token: 5 })],
  ])("is nothing when what is stored is %s", (_name, stored) => {
    localStorage.setItem("chatter.account", stored);

    expect(loadAccount(NOW)).toBeNull();
  });

  it("does not fail when storage is not there", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("off");
    });
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("off");
    });

    expect(() => saveAccount(account)).not.toThrow();
    expect(() => clearAccount()).not.toThrow();
    expect(loadAccount(NOW)).toBeNull();
  });
});
