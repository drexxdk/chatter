import { describe, expect, it } from "vitest";

import {
  clearSession,
  loadDirect,
  loadSession,
  rememberConnection,
  saveDirect,
  saveSession,
} from "./session";

const SESSION = "chatter.session";
const DIRECT = "chatter.direct";

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `guest-${index + 1}`);
const stored = (key: string) =>
  JSON.parse(sessionStorage.getItem(key) ?? "null");

describe("the open conversation", () => {
  it("is saved with the conversations and read back", () => {
    saveSession({ nickname: "Alice" });
    saveDirect({ threads: [], blockedIds: [], openGuestId: "guest-bob" });

    expect(loadDirect().openGuestId).toBe("guest-bob");
  });

  it("is absent when none was open", () => {
    saveSession({ nickname: "Alice" });
    saveDirect({ threads: [], blockedIds: [] });

    expect(loadDirect()).not.toHaveProperty("openGuestId");
  });

  it.each([
    ["a number", 7],
    ["empty", ""],
    ["a list", ["x"]],
    ["null", null],
  ])("is not read back when it is %s", (_label, value) => {
    sessionStorage.setItem(
      DIRECT,
      JSON.stringify({ threads: [], blockedIds: [], openGuestId: value }),
    );

    expect(loadDirect()).not.toHaveProperty("openGuestId");
  });
});

describe("the saved session", () => {
  const put = (value: unknown) =>
    sessionStorage.setItem(SESSION, JSON.stringify(value));

  it("is nothing when there is nothing, or what is saved is not an object", () => {
    expect(loadSession()).toBeNull();

    sessionStorage.setItem(SESSION, "not json");
    expect(loadSession()).toBeNull();

    put("Alice");
    expect(loadSession()).toBeNull();
  });

  it("needs a nickname", () => {
    put({ nickname: "" });
    expect(loadSession()).toBeNull();

    put({ nickname: 3 });
    expect(loadSession()).toBeNull();
  });

  it("is refused when the token is not text", () => {
    put({ nickname: "Ada", token: 5 });

    expect(loadSession()).toBeNull();
  });

  it("reads a token that is text", () => {
    put({ nickname: "Ada", token: "signed" });

    expect(loadSession()).toEqual({ nickname: "Ada", token: "signed" });
  });

  it.each([
    ["without a secret", { guestId: "guest-old" }],
    ["without an id", { secret: "old-secret" }],
    ["with an empty id", { guestId: "", secret: "old-secret" }],
    ["with an empty secret", { guestId: "guest-old", secret: "" }],
    ["with numbers", { guestId: 1, secret: 2 }],
    ["that is not an object", "guest-old"],
    ["that is null", null],
  ])("does not read what was saved to resume %s", (_label, resume) => {
    put({ nickname: "Alice", resume });

    expect(loadSession()).toEqual({ nickname: "Alice" });
  });

  it("reads what was saved to resume", () => {
    const resume = { guestId: "guest-old", secret: "old-secret" };
    put({ nickname: "Alice", resume });

    expect(loadSession()?.resume).toEqual(resume);
  });

  it("keeps only the latest 20 ids when it reads", () => {
    put({ nickname: "Alice", guestIds: ids(25) });

    expect(loadSession()?.guestIds).toEqual(ids(25).slice(-20));
  });

  it("keeps only the latest 20 ids when it saves", () => {
    saveSession({ nickname: "Alice", guestIds: ids(25) });

    expect(stored(SESSION).guestIds).toEqual(ids(25).slice(-20));
  });

  it("leaves out ids that are empty or not text", () => {
    put({ nickname: "Alice", guestIds: ["guest-1", "", 7, null, "guest-2"] });

    expect(loadSession()?.guestIds).toEqual(["guest-1", "guest-2"]);
  });

  it("has no ids when none are left", () => {
    put({ nickname: "Alice", guestIds: ["", 7] });

    expect(loadSession()).toEqual({ nickname: "Alice" });
  });

  it("ignores an avatar nobody knows", () => {
    put({ nickname: "Alice", avatar: "wizard" });

    expect(loadSession()).toEqual({ nickname: "Alice" });
  });

  it("reads an avatar that is known", () => {
    put({ nickname: "Alice", avatar: "female" });

    expect(loadSession()?.avatar).toBe("female");
  });
});

describe("remembering a new connection", () => {
  const resume = { guestId: "guest-2", secret: "secret-2" };

  it("adds the ids and the new secret to what was saved", () => {
    saveSession({ nickname: "Alice", guestIds: ["guest-1"] });

    rememberConnection({ guestIds: ["guest-1", "guest-2"], resume });

    expect(loadSession()).toEqual({
      nickname: "Alice",
      guestIds: ["guest-1", "guest-2"],
      resume,
    });
  });

  it("keeps the secret it had when there is no new one", () => {
    const before = { guestId: "guest-1", secret: "secret-1" };
    saveSession({ nickname: "Alice", guestIds: ["guest-1"], resume: before });

    rememberConnection({ guestIds: ["guest-1"], resume: null });

    expect(loadSession()?.resume).toEqual(before);
  });

  it("does nothing when no session is saved, so a forgotten one stays forgotten", () => {
    rememberConnection({ guestIds: ["guest-1"], resume });

    expect(sessionStorage.getItem(SESSION)).toBeNull();
  });

  it("does nothing when there are no ids yet", () => {
    saveSession({ nickname: "Alice" });

    rememberConnection({ guestIds: [], resume });

    expect(loadSession()).toEqual({ nickname: "Alice" });
  });
});

describe("the saved conversations", () => {
  it("are not saved when no session is", () => {
    saveDirect({ threads: [], blockedIds: ["guest-bob"] });

    expect(sessionStorage.getItem(DIRECT)).toBeNull();
  });

  it("keep at most 100 blocked ids when they are read", () => {
    sessionStorage.setItem(
      DIRECT,
      JSON.stringify({ threads: [], blockedIds: ids(120) }),
    );

    expect(loadDirect().blockedIds).toEqual(ids(120).slice(0, 100));
  });

  it("leave out blocked ids that are empty or not text", () => {
    sessionStorage.setItem(
      DIRECT,
      JSON.stringify({ threads: [], blockedIds: ["guest-1", "", 7, null] }),
    );

    expect(loadDirect().blockedIds).toEqual(["guest-1"]);
  });

  it("are empty when what is saved is damaged", () => {
    sessionStorage.setItem(DIRECT, "not json");

    expect(loadDirect()).toEqual({ threads: [], blockedIds: [] });
  });

  it("go when the session is cleared", () => {
    saveSession({ nickname: "Alice" });
    saveDirect({ threads: [], blockedIds: ["guest-bob"] });

    clearSession();

    expect(sessionStorage.getItem(SESSION)).toBeNull();
    expect(sessionStorage.getItem(DIRECT)).toBeNull();
  });
});
