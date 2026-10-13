import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadAccount, saveAccount } from "./account";
import { loadSession, saveSession } from "./session";
import { ROOMS, joinRoom, setup } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

const ACCOUNT = {
  token: "member-abc",
  provider: "google",
  nickname: "Alice",
  avatar: "female" as const,
  expiresAt: Date.now() + 30 * 86_400_000,
};

const accountSession = (token = "member-abc") => ({
  token,
  provider: "google",
  profile: { nickname: "Alice", avatar: "female" },
  expiresAt: ACCOUNT.expiresAt,
});

type Answer = { status?: number; body: unknown };

// The chat-server as these tests need it: the rooms, which providers are on, and the account's own routes.
function stubBackend(
  options: {
    providers?: string[];
    me?: () => Answer;
    remove?: () => Answer;
  } = {},
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const answer = (value: Answer) =>
      Response.json(value.body, { status: value.status ?? 200 });

    if (path === "/rooms") return Response.json(ROOMS);
    if (path === "/auth/providers") {
      return Response.json({ providers: options.providers ?? [] });
    }
    if (path === "/me" && method === "GET") {
      return answer(options.me?.() ?? { body: accountSession() });
    }
    if (path === "/me" && method === "DELETE") {
      return answer(options.remove?.() ?? { body: { ok: true } });
    }

    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callsTo = (fetchMock: ReturnType<typeof stubBackend>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === path);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signing in from the lobby", () => {
  it("is offered when the server has a provider, with the way to it", async () => {
    stubBackend({ providers: ["google"] });
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Account" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByRole("heading", { name: "Account" }),
    ).toBeInTheDocument();
    expect(
      dialog.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute(
      "href",
      "http://localhost:4000/auth/google/start?return=%2F",
    );
  });

  it("is not offered when the server has no provider", async () => {
    const fetchMock = stubBackend();
    setup();
    await screen.findByRole("heading", { name: "General" });
    await waitFor(() =>
      expect(callsTo(fetchMock, "/auth/providers")).not.toHaveLength(0),
    );

    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
  });

  it("is offered to a guest who is asked for a nickname, with the room to come back to", async () => {
    stubBackend({ providers: ["google", "discord"] });
    const { user } = setup();

    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    for (const name of ["Google", "Discord"]) {
      expect(
        await dialog.findByRole("link", { name: `Continue with ${name}` }),
      ).toHaveAttribute(
        "href",
        expect.stringContaining("return=%2Frooms%2Fgeneral"),
      );
    }
  });

  it("is offered to a guest in a room, from their profile", async () => {
    stubBackend({ providers: ["google"] });
    const { user } = setup();
    await joinRoom(user);

    await user.click(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      await dialog.findByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("return=%2Frooms%2Fgeneral"),
    );
    expect(
      dialog.getByText(/keep your nickname, avatar and age/),
    ).toBeInTheDocument();
  });
});

describe("somebody signed in", () => {
  beforeEach(() => {
    saveAccount(ACCOUNT);
  });

  it("has their profile in the header of the lobby", async () => {
    stubBackend({ providers: ["google"] });
    setup();

    expect(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
  });

  it("joins a room without being asked for a nickname, as the account", async () => {
    stubBackend();
    const server = makeFakeServer();
    const { user } = setup(server);

    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );

    expect(
      await screen.findByRole("heading", { name: "General", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nickname/)).toBeNull();
    expect(server.createSocket.mock.calls[0]?.slice(0, 2)).toEqual([
      "Alice",
      "member-abc",
    ]);
    expect(server.latest?.role).toBe("member");
    expect(loadSession()).toMatchObject({
      nickname: "Alice",
      token: "member-abc",
    });
  });

  it("is brought back into the room a reload finds them in", async () => {
    stubBackend();
    saveSession({ nickname: "Alice", token: "member-abc" });
    window.history.replaceState(null, "", "/rooms/general");
    const server = makeFakeServer();

    setup(server);

    expect(
      await screen.findByRole("heading", { name: "General", level: 2 }),
    ).toBeInTheDocument();
    expect(server.createSocket.mock.calls[0]?.[1]).toBe("member-abc");
  });

  it("sees the account in their profile, and not the offer to make one", async () => {
    stubBackend({ providers: ["google"] });
    const { user } = setup(makeFakeServer());
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Signed in with Google.")).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(dialog.queryByRole("link", { name: /Continue with/ })).toBeNull();
    // The profile can still be changed, like a guest's.
    expect(dialog.getByLabelText(/Nickname/)).toHaveValue("Alice");
  });

  it("keeps the changes to their profile in the account of this browser too", async () => {
    stubBackend();
    const { user } = setup(makeFakeServer());
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    );
    const dialog = within(await screen.findByRole("dialog"));

    await user.clear(dialog.getByLabelText(/Nickname/));
    await user.type(dialog.getByLabelText(/Nickname/), "Alicia");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("button", { name: "Your profile: Alicia" }),
    ).toBeInTheDocument();
    expect(loadAccount()?.nickname).toBe("Alicia");
  });

  describe("signing out", () => {
    it("forgets the account and leaves the room, and the lobby offers to sign in again", async () => {
      stubBackend({ providers: ["google"] });
      const { user } = setup(makeFakeServer());
      await user.click(
        await screen.findByRole("button", { name: "Join General" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Your profile: Alice" }),
      );

      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Sign out",
        }),
      );

      expect(
        await screen.findByRole("heading", { name: "Public rooms" }),
      ).toBeInTheDocument();
      expect(loadAccount()).toBeNull();
      expect(loadSession()).toBeNull();
      expect(
        await screen.findByRole("button", { name: "Account" }),
      ).toBeInTheDocument();
    });

    it("is possible from the lobby too", async () => {
      stubBackend({ providers: ["google"] });
      const { user } = setup();
      await user.click(
        await screen.findByRole("button", { name: "Your profile: Alice" }),
      );

      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Sign out",
        }),
      );

      expect(
        await screen.findByRole("button", { name: "Account" }),
      ).toBeInTheDocument();
      expect(loadAccount()).toBeNull();
    });
  });

  describe("deleting the account", () => {
    async function askToDelete(user: ReturnType<typeof userEvent.setup>) {
      await user.click(
        await screen.findByRole("button", { name: "Your profile: Alice" }),
      );
      const dialog = within(await screen.findByRole("dialog"));
      await user.click(
        dialog.getByRole("button", { name: "Delete my account" }),
      );
      return dialog;
    }

    it("asks first, and says what it means", async () => {
      stubBackend();
      const { user } = setup();

      const dialog = await askToDelete(user);

      expect(
        dialog.getByText(/This deletes your account and frees your nickname/),
      ).toBeInTheDocument();
      await user.click(dialog.getByRole("button", { name: "Cancel" }));
      expect(
        dialog.getByRole("button", { name: "Sign out" }),
      ).toBeInTheDocument();
      expect(loadAccount()).not.toBeNull();
    });

    it("deletes it on the server with the token, and forgets it here", async () => {
      const fetchMock = stubBackend();
      const { user } = setup();
      const dialog = await askToDelete(user);

      await user.click(
        dialog.getByRole("button", { name: "Yes, delete my account" }),
      );

      await waitFor(() => expect(loadAccount()).toBeNull());
      const [, init] = callsTo(fetchMock, "/me").find(
        ([, request]) => request?.method === "DELETE",
      ) as [string, RequestInit];
      expect(init.headers).toEqual({ Authorization: "Bearer member-abc" });
    });

    it("keeps the account, and says why, when the server cannot delete it", async () => {
      stubBackend({
        remove: () => ({ status: 503, body: { error: "unavailable" } }),
      });
      const { user } = setup();
      const dialog = await askToDelete(user);

      await user.click(
        dialog.getByRole("button", { name: "Yes, delete my account" }),
      );

      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "temporarily unavailable",
      );
      expect(loadAccount()).not.toBeNull();
    });
  });
});

describe("an account that does not work any more", () => {
  beforeEach(() => {
    saveAccount(ACCOUNT);
  });

  it("is forgotten when the page opens and the server does not know it", async () => {
    stubBackend({
      me: () => ({ status: 401, body: { error: "invalid_token" } }),
    });
    setup();

    await waitFor(() => expect(loadAccount()).toBeNull());
    expect(
      screen.queryByRole("button", { name: "Your profile: Alice" }),
    ).toBeNull();
  });

  it("is kept when the server cannot be reached, so a bad moment does not sign anybody out", async () => {
    stubBackend({
      me: () => ({ status: 503, body: { error: "unavailable" } }),
    });
    setup();

    expect(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    ).toBeInTheDocument();
    expect(loadAccount()).not.toBeNull();
  });

  it("is forgotten when a room refuses its token, and the guest is asked for a nickname instead", async () => {
    let asked = 0;
    stubBackend({
      me: () =>
        ++asked === 1
          ? { body: accountSession() }
          : { status: 401, body: { error: "invalid_token" } },
    });
    const server = makeFakeServer();
    server.failNextConnections("invalid_token");
    const { user } = setup(server);
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );

    expect(await screen.findByLabelText(/Nickname/)).toBeInTheDocument();
    expect(loadAccount()).toBeNull();
  });
});
