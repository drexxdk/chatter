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
  username: "alice_w",
  picture: "lorelei:abc12345",
  avatar: "female" as const,
  expiresAt: Date.now() + 30 * 86_400_000,
};

const accountSession = (token = "member-abc") => ({
  token,
  provider: "google",
  profile: {
    nickname: "Alice",
    username: "alice_w",
    picture: "lorelei:abc12345",
    avatar: "female",
  },
  expiresAt: ACCOUNT.expiresAt,
});

type Answer = { status?: number; body: unknown };

// The chat-server as these tests need it: the rooms, which providers are on, and the account's own routes.
function stubBackend(
  options: {
    providers?: string[];
    me?: () => Answer;
    remove?: () => Answer;
    update?: (changes: Record<string, unknown>) => Answer;
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
    if (path === "/me" && method === "PATCH") {
      const changes = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return answer(
        options.update?.(changes) ?? {
          body: { profile: { ...accountSession().profile, ...changes } },
        },
      );
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
  it("has no login in the header: a guest is asked who they are when they join a room", async () => {
    stubBackend({ providers: ["google"] });
    const { user } = setup();
    await screen.findByRole("heading", { name: "General" });

    expect(screen.queryByRole("button", { name: "Login" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Join General" }));

    expect(
      await within(await screen.findByRole("dialog")).findByRole("link", {
        name: "Continue with Google",
      }),
    ).toBeInTheDocument();
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
      dialog.getByText(/keep your name, avatar and age/),
    ).toBeInTheDocument();
    // A guest chooses a picture too, like an account, once they ask to change their profile.
    await user.click(dialog.getByRole("button", { name: "Edit profile" }));
    expect(dialog.getByRole("group", { name: "Avatar" })).toBeInTheDocument();
  });

  it("lets a guest sign out from their profile: the saved identity goes, the connection ends, and the lobby is the lobby of somebody who is not here", async () => {
    stubBackend({ providers: ["google"] });
    const { user, server } = setup();
    await joinRoom(user);
    await user.click(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    );
    expect(loadSession()).not.toBeNull();

    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Sign out",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(loadSession()).toBeNull();
    expect(server.latest.disconnected).toBe(true);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^Your profile:/ }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /^Your profile:/ })).toBeNull();
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
    expect(screen.queryByRole("button", { name: "Login" })).toBeNull();
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

  it("is brought into the room an address names, as the account, when coming back from a provider with nothing else saved", async () => {
    stubBackend();
    window.history.replaceState(null, "", "/rooms/general");
    const server = makeFakeServer();

    setup(server);

    expect(
      await screen.findByRole("heading", { name: "General", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nickname/)).toBeNull();
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
    expect(dialog.getByText("Google")).toBeInTheDocument();
    expect(dialog.getByText("Signed in with")).toBeInTheDocument();
    expect(dialog.getByText("alice_w")).toBeInTheDocument();
    expect(dialog.getByText("Not specified")).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(dialog.queryByRole("link", { name: /Continue with/ })).toBeNull();
    // The profile can still be changed, like a guest's: the name the chat shows, and the picture.
    await user.click(dialog.getByRole("button", { name: "Edit profile" }));
    expect(dialog.getByLabelText(/Display name/)).toHaveValue("Alice");
    expect(dialog.getByRole("group", { name: "Avatar" })).toBeInTheDocument();
  });

  it("can change the picture they are shown by", async () => {
    stubBackend();
    const server = makeFakeServer();
    const { user } = setup(server);
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    );
    const dialog = within(await screen.findByRole("dialog"));

    await user.click(dialog.getByRole("button", { name: "Edit profile" }));
    await user.click(dialog.getByRole("radio", { name: "Avatar 3" }));
    const chosen = (
      dialog.getByRole("radio", { name: "Avatar 3" }) as HTMLInputElement
    ).value;
    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(server.latest?.emittedEvents("profile:update")).toEqual([
        { picture: chosen },
      ]),
    );
    expect(loadAccount()?.picture).toBe(chosen);
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

    await user.click(dialog.getByRole("button", { name: "Edit profile" }));
    await user.clear(dialog.getByLabelText(/Display name/));
    await user.type(dialog.getByLabelText(/Display name/), "Alicia");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("button", {
        name: "Your profile: Alicia",
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(loadAccount()?.nickname).toBe("Alicia");
  });

  describe("from the lobby", () => {
    async function openProfileInLobby(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await user.click(
        await screen.findByRole("button", { name: "Your profile: Alice" }),
      );

      return within(
        await screen.findByRole("dialog", { name: "Your profile" }),
      );
    }

    it("shows the same profile as in a room", async () => {
      stubBackend();
      const { user } = setup();

      const dialog = await openProfileInLobby(user);

      expect(dialog.getByText("Female")).toBeInTheDocument();
      expect(dialog.getByText("Not given")).toBeInTheDocument();
      expect(dialog.getByText("Google")).toBeInTheDocument();
      expect(
        dialog.getByRole("button", { name: "Edit profile" }),
      ).toBeInTheDocument();
    });

    it("changes the account on the server with the token, and shows the change", async () => {
      const fetchMock = stubBackend();
      const { user } = setup();
      const dialog = await openProfileInLobby(user);

      await user.click(dialog.getByRole("button", { name: "Edit profile" }));
      await user.clear(dialog.getByLabelText(/Display name/));
      await user.type(dialog.getByLabelText(/Display name/), "Alicia");
      await user.type(dialog.getByLabelText("Age"), "29");
      await user.click(dialog.getByRole("button", { name: "Save" }));

      expect(await dialog.findByText("29 years old")).toBeInTheDocument();
      const [, init] = callsTo(fetchMock, "/me").find(
        ([, request]) => request?.method === "PATCH",
      ) as [string, RequestInit];
      expect(init.headers).toMatchObject({
        Authorization: "Bearer member-abc",
      });
      expect(JSON.parse(String(init.body))).toEqual({
        nickname: "Alicia",
        age: 29,
      });
      expect(
        await screen.findByRole("button", {
          name: "Your profile: Alicia",
          hidden: true,
        }),
      ).toBeInTheDocument();
      expect(loadAccount()).toMatchObject({ nickname: "Alicia", age: 29 });
    });

    it("says why the server refused, and keeps the form", async () => {
      stubBackend({
        update: () => ({
          status: 409,
          body: { error: "reserved_nickname" },
        }),
      });
      const { user } = setup();
      const dialog = await openProfileInLobby(user);

      await user.click(dialog.getByRole("button", { name: "Edit profile" }));
      await user.clear(dialog.getByLabelText(/Display name/));
      await user.type(dialog.getByLabelText(/Display name/), "Taken");
      await user.click(dialog.getByRole("button", { name: "Save" }));

      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "That nickname is reserved. Pick another one.",
      );
      expect(loadAccount()?.nickname).toBe("Alice");
    });
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
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: /^Your profile:/ }),
        ).toBeNull(),
      );
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

      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: /^Your profile:/ }),
        ).toBeNull(),
      );
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
