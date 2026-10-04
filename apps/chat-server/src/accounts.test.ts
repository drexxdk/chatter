import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchModerators, loginAccount } from "./payloadClient.js";

function respondWith(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => Response.json(body, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loginAccount", () => {
  const user = { id: 7, role: "moderator", displayName: "Ada Mod" };

  it("asks Payload to check the credentials, without the service key", async () => {
    const fetchMock = respondWith({ user, token: "payload-jwt" });

    await loginAccount("ada@example.com", "pw");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://localhost:3000/api/admins/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ada@example.com",
      password: "pw",
    });
    // The person's own credentials decide; the service account must not vouch for them.
    expect(JSON.stringify(init.headers)).not.toMatch(/API-Key/);
  });

  it("returns who signed in, and nothing else of the response", async () => {
    respondWith({
      user: { ...user, email: "ada@example.com", hash: "secret" },
      token: "payload-jwt",
    });

    expect(await loginAccount("ada@example.com", "pw")).toEqual({
      id: 7,
      role: "moderator",
      displayName: "Ada Mod",
    });
  });

  it("allows an account that has no display name yet", async () => {
    respondWith({ user: { id: 1, role: "super-admin" }, token: "t" });

    expect(await loginAccount("a@example.com", "pw")).toEqual({
      id: 1,
      role: "super-admin",
      displayName: null,
    });
  });

  // A wrong email, a wrong password and a locked account are all the same answer, so nothing is revealed.
  it.each([401, 403])(
    "returns nothing when Payload answers %i",
    async (status) => {
      respondWith({ errors: [{ message: "nope" }] }, { status });

      expect(await loginAccount("ada@example.com", "bad")).toBeUndefined();
    },
  );

  it("fails, rather than refusing the person, when Payload is in trouble", async () => {
    respondWith({}, { status: 500 });

    await expect(loginAccount("ada@example.com", "pw")).rejects.toThrow(/500/);
  });

  it("fails on a response it cannot read", async () => {
    respondWith({ user: { id: "seven" }, token: "t" });

    await expect(loginAccount("ada@example.com", "pw")).rejects.toThrow(/user/);
  });

  it("never puts the password in an error", async () => {
    respondWith({}, { status: 500 });

    const message = await loginAccount("ada@example.com", "hunter2").then(
      () => "",
      (error: Error) => error.message,
    );

    expect(message).not.toContain("hunter2");
  });
});

describe("fetchModerators", () => {
  it("asks for the moderating accounts with the service key", async () => {
    const fetchMock = respondWith({ docs: [] });

    await fetchModerators();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/admins?");
    expect(decodeURIComponent(url)).toContain(
      "where[role][in]=moderator,super-admin",
    );
    expect(init.headers).toEqual({
      Authorization: "admins API-Key test-api-key",
    });
  });

  it("returns the accounts with their names, and no name for an empty or missing one", async () => {
    respondWith({
      docs: [
        { id: 1, displayName: "Ada Mod", email: "ada@example.com" },
        { id: 2, displayName: null },
        { id: 3 },
        { id: 4, displayName: "" },
        { id: 5, displayName: "Grace" },
      ],
    });

    expect(await fetchModerators()).toEqual([
      { id: 1, name: "Ada Mod" },
      { id: 2, name: null },
      { id: 3, name: null },
      { id: 4, name: null },
      { id: 5, name: "Grace" },
    ]);
  });

  it("rejects an account without an id", async () => {
    respondWith({ docs: [{ displayName: "Ada Mod" }] });

    await expect(fetchModerators()).rejects.toThrow(/docs\.0\.id/);
  });

  it("rejects a response it cannot read", async () => {
    respondWith({ docs: "nope" });

    await expect(fetchModerators()).rejects.toThrow(/docs/);
  });
});
