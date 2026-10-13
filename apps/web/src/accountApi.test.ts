import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AccountError,
  authStartUrl,
  deleteAccount,
  fetchAccount,
  fetchAuthProviders,
  forgetAuthProviders,
  registerAccount,
} from "./api";

const SESSION = {
  token: "member-token",
  provider: "google",
  profile: {
    nickname: "Alice Wonder",
    username: "alice_w",
    picture: "lorelei:abc12345",
    avatar: "female",
    age: 30,
  },
  expiresAt: 1_800_000_000_000,
};

// What an account is made with besides the ticket.
const WHO = {
  username: "alice_w",
  nickname: "Alice Wonder",
  picture: "lorelei:abc12345",
  avatar: "other" as const,
};

function respondWith(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => Response.json(body, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callOf = (fetchMock: ReturnType<typeof respondWith>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => {
  vi.unstubAllGlobals();
  forgetAuthProviders();
});

describe("the providers", () => {
  it("are the ones the chat-server lists", async () => {
    const fetchMock = respondWith({ providers: ["google", "discord"] });

    expect(await fetchAuthProviders()).toEqual(["google", "discord"]);
    expect(callOf(fetchMock)[0]).toBe("http://localhost:4000/auth/providers");
  });

  it.each([
    ["an answer that is not the list", { providers: "google" }],
    ["a list of other things", { providers: [1, null] }],
    ["a list of rooms from an older server", [{ id: 1 }]],
  ])("are none for %s", async (_name, body) => {
    respondWith(body);

    expect(await fetchAuthProviders()).toEqual([]);
  });

  it("are none when the chat-server refuses or cannot be reached", async () => {
    respondWith({}, { status: 404 });
    expect(await fetchAuthProviders()).toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await fetchAuthProviders()).toEqual([]);
  });

  it("have an address to leave for, with where to come back to", () => {
    expect(authStartUrl("google", "/rooms/music?x=1")).toBe(
      "http://localhost:4000/auth/google/start?return=%2Frooms%2Fmusic%3Fx%3D1",
    );
  });
});

describe("making an account", () => {
  it("sends the ticket and who they want to be, and reads the session that comes back", async () => {
    const fetchMock = respondWith(SESSION);

    const session = await registerAccount({
      ticket: "the-ticket",
      ...WHO,
      avatar: "female",
      age: 30,
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe("http://localhost:4000/auth/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      ticket: "the-ticket",
      username: "alice_w",
      nickname: "Alice Wonder",
      picture: "lorelei:abc12345",
      avatar: "female",
      age: 30,
    });
    expect(session).toEqual(SESSION);
  });

  it("makes an unknown avatar the plain one, drops a picture that is not one, and leaves out an age that is not one", async () => {
    respondWith({
      ...SESSION,
      profile: {
        nickname: "Alice",
        picture: "robot:abc12345",
        avatar: "robot",
        age: 7,
      },
    });

    expect((await registerAccount({ ticket: "t", ...WHO })).profile).toEqual({
      nickname: "Alice",
      avatar: "other",
    });
  });

  it.each([
    [400, "invalid_nickname"],
    [409, "reserved_nickname"],
    [400, "invalid_username"],
    [409, "reserved_username"],
    [401, "invalid_ticket"],
    [400, "invalid_profile"],
    [503, "unavailable"],
  ])("fails with the code the server gave (%s %s)", async (status, error) => {
    respondWith({ error }, { status });

    await expect(
      registerAccount({ ticket: "t", ...WHO }),
    ).rejects.toMatchObject({ code: error });
  });

  it.each([
    [
      "a code it does not know",
      () => respondWith({ error: "weird" }, { status: 500 }),
    ],
    ["an answer without a session", () => respondWith({ ok: true })],
    [
      "no answer",
      () =>
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down"))),
    ],
  ])("fails as a connection problem for %s", async (_name, arrange) => {
    arrange();

    await expect(
      registerAccount({ ticket: "t", ...WHO }),
    ).rejects.toMatchObject({ code: "connection" });
  });

  it("tells that there have been too many tries", async () => {
    respondWith({ error: "rate_limited" }, { status: 429 });

    await expect(
      registerAccount({ ticket: "t", ...WHO }),
    ).rejects.toMatchObject({ code: "too_many_attempts" });
  });
});

describe("the account behind a token", () => {
  it("is read with the token, which comes back renewed", async () => {
    const fetchMock = respondWith(SESSION);

    expect(await fetchAccount("old-token")).toEqual(SESSION);
    expect(callOf(fetchMock)[0]).toBe("http://localhost:4000/me");
    expect(callOf(fetchMock)[1].headers).toEqual({
      Authorization: "Bearer old-token",
    });
  });

  it("is refused for a token that no longer works", async () => {
    respondWith({ error: "invalid_token" }, { status: 401 });

    const error = await fetchAccount("old-token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccountError);
    expect((error as AccountError).code).toBe("invalid_token");
  });

  it("is deleted with the token", async () => {
    const fetchMock = respondWith({ ok: true });

    await deleteAccount("the-token");

    const [url, init] = callOf(fetchMock);
    expect(url).toBe("http://localhost:4000/me");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ Authorization: "Bearer the-token" });
  });

  it("is not deleted when the server cannot do it", async () => {
    respondWith({ error: "unavailable" }, { status: 503 });

    await expect(deleteAccount("t")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
