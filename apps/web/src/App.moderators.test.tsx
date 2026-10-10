import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROOMS, stubRooms, setup, joinRoom, at, message } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

describe("moderators", () => {
  const accepted = () => ({
    ok: true,
    status: 200,
    json: async () => ({
      token: "signed-token",
      name: "Ada Mod",
      role: "moderator",
      expiresAt: Date.now() + 3_600_000,
    }),
  });
  const refused = (status: number, error: string) => () => ({
    ok: false,
    status,
    json: async () => ({ error }),
  });

  function stubBackend(login: () => unknown) {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/moderator/login")
        ? login()
        : { ok: true, json: async () => ROOMS },
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await screen.findByLabelText("Nickname");
  }

  async function signIn(
    user: ReturnType<typeof userEvent.setup>,
    email = "ada@example.com",
    password = "correct horse",
  ) {
    await openDialog(user);
    await user.click(
      screen.getByRole("button", { name: "Sign in as moderator" }),
    );
    await user.type(await screen.findByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
  }

  describe("the dialog", () => {
    it("offers to sign in as a moderator, in place of choosing a nickname", async () => {
      stubBackend(accepted);
      const { user } = setup();
      await openDialog(user);

      await user.click(
        screen.getByRole("button", { name: "Sign in as moderator" }),
      );

      expect(screen.getByLabelText("Email")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "type",
        "password",
      );
      expect(screen.queryByLabelText("Nickname")).not.toBeInTheDocument();
    });

    it("goes back to choosing a nickname", async () => {
      stubBackend(accepted);
      const { user } = setup();
      await openDialog(user);
      await user.click(
        screen.getByRole("button", { name: "Sign in as moderator" }),
      );

      await user.click(
        screen.getByRole("button", { name: "Continue as guest" }),
      );

      expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    });

    it("does not call the server until both fields are filled in", async () => {
      const fetchMock = stubBackend(accepted);
      const { user, server } = setup();
      await openDialog(user);
      await user.click(
        screen.getByRole("button", { name: "Sign in as moderator" }),
      );

      await user.click(screen.getByRole("button", { name: "Sign in" }));

      expect(
        fetchMock.mock.calls.some(([url]) => url.endsWith("/moderator/login")),
      ).toBe(false);
      expect(server.createSocket).not.toHaveBeenCalled();
    });
  });

  describe("signing in", () => {
    it("posts the email and password to the chat server, then joins the room under the account's name", async () => {
      const fetchMock = stubBackend(accepted);
      const { user, server } = setup();

      await signIn(user);

      await screen.findByRole("button", { name: "Your profile: Ada Mod" });
      const [, init] = fetchMock.mock.calls.find(([url]) =>
        url.endsWith("/moderator/login"),
      ) as unknown as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        email: "ada@example.com",
        password: "correct horse",
      });
      expect(server.createSocket).toHaveBeenCalledWith(
        "Ada Mod",
        "signed-token",
      );
      expect(server.latest.emittedEvents("room:join")).toEqual([
        { slug: "general" },
      ]);
    });

    it("never hands the password to the socket", async () => {
      stubBackend(accepted);
      const { user, server } = setup();

      await signIn(user);
      await screen.findByRole("button", { name: "Your profile: Ada Mod" });

      expect(JSON.stringify(server.createSocket.mock.calls)).not.toContain(
        "correct horse",
      );
    });

    it.each([
      [
        "wrong credentials",
        refused(401, "invalid_credentials"),
        "Wrong email or password.",
      ],
      [
        "an account that cannot moderate",
        refused(403, "not_a_moderator"),
        "This account cannot moderate the chat.",
      ],
      [
        "an account without a name",
        refused(403, "no_display_name"),
        "no display name yet",
      ],
      [
        "sign-in being switched off",
        refused(503, "moderator_login_disabled"),
        "Moderator sign-in is not available",
      ],
      [
        "too many attempts",
        refused(429, "rate_limited"),
        "Too many sign-in attempts",
      ],
      [
        "the chat being unavailable",
        refused(503, "unavailable"),
        "temporarily unavailable",
      ],
    ])(
      "explains %s and keeps the dialog open",
      async (_label, response, text) => {
        stubBackend(response);
        const { user, server } = setup();

        await signIn(user);

        expect(await screen.findByRole("alert")).toHaveTextContent(text);
        expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
        expect(server.createSocket).not.toHaveBeenCalled();
      },
    );

    it("explains an unreachable chat server", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.endsWith("/moderator/login")) throw new TypeError("offline");
          return { ok: true, json: async () => ROOMS };
        }),
      );
      const { user } = setup();

      await signIn(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not reach the chat server.",
      );
    });

    it("does not offer the room to somebody who has not signed in", async () => {
      stubBackend(refused(401, "invalid_credentials"));
      const { user } = setup();

      await signIn(user);
      await screen.findByRole("alert");

      expect(screen.queryByText(/Chatting as/)).not.toBeInTheDocument();
    });
  });

  describe("staying signed in", () => {
    it("reconnects with the same token after the connection drops", async () => {
      stubBackend(accepted);
      const { user, server } = setup(makeFakeServer(), [0]);
      await signIn(user);
      await screen.findByRole("button", { name: "Your profile: Ada Mod" });

      act(() => server.latest.serverEmit("disconnect", "transport close"));

      await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
      expect(server.createSocket).toHaveBeenLastCalledWith(
        "Ada Mod",
        "signed-token",
        undefined,
        { guestId: "guest-me", secret: "secret-1" },
      );
    });

    it("sends the guest back to the lobby, saying the session ended, when the token has expired", async () => {
      stubBackend(accepted);
      const server = makeFakeServer();
      const { user } = setup(server, [0]);
      await signIn(user);
      await screen.findByRole("button", { name: "Your profile: Ada Mod" });
      server.failNextConnections("invalid_token");

      act(() => server.latest.serverEmit("disconnect", "transport close"));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your moderator session has expired",
      );
      expect(
        screen.getByRole("heading", { name: "Public rooms" }),
      ).toBeInTheDocument();
      // Retrying cannot help, so it stops at once.
      expect(server.createSocket).toHaveBeenCalledTimes(2);
    });

    it("sends the moderator back to the lobby at once when their account is removed", async () => {
      stubBackend(accepted);
      const server = makeFakeServer();
      const { user } = setup(server, [0]);
      await signIn(user);
      await screen.findByRole("button", { name: "Your profile: Ada Mod" });

      act(() => {
        server.latest.serverEmit("kicked", { reason: "invalid_token" });
        server.latest.serverEmit("disconnect", "io server disconnect");
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your moderator session has expired",
      );
      expect(
        screen.getByRole("heading", { name: "Public rooms" }),
      ).toBeInTheDocument();
      expect(server.createSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe("how they look", () => {
    const log = () => within(screen.getByRole("log"));

    async function enterAsGuest(history: unknown[] = [], live: unknown[] = []) {
      const server = makeFakeServer();
      server.acks["room:join"] = () => {
        live.forEach((m) => server.latest.serverEmit("message:new", m));
        return { ok: true, history };
      };
      const result = setup(server);
      await joinRoom(result.user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      return result;
    }

    const fromModerator = (overrides: Partial<Record<string, string>> = {}) =>
      message({
        guestId: "guest-mod",
        nickname: "Ada Mod",
        role: "moderator",
        text: "please keep it friendly",
        ...overrides,
      });

    it("shows a moderator's name and words in green and bold, with a label", async () => {
      await enterAsGuest([], [fromModerator()]);

      expect(log().getByText("Ada Mod")).toHaveClass(
        "font-bold",
        "text-green-400",
      );
      expect(log().getByText("please keep it friendly")).toHaveClass(
        "font-bold",
        "text-green-300",
      );
      expect(log().getByText("Moderator")).toBeInTheDocument();
    });

    it("shows a guest's message plainly, without a label", async () => {
      await enterAsGuest([], [message({ role: "guest", text: "hello" })]);

      expect(log().getByText("Bob")).not.toHaveClass("text-green-400");
      expect(log().getByText("hello")).not.toHaveClass("font-bold");
      expect(log().queryByText("Moderator")).not.toBeInTheDocument();
    });

    it("treats a message without a role as a guest's", async () => {
      await enterAsGuest([], [message({ text: "hello" })]);

      expect(log().queryByText("Moderator")).not.toBeInTheDocument();
    });

    it("shows moderators in the history the same way", async () => {
      await enterAsGuest([fromModerator({ sentAt: at(1) })]);

      expect(log().getByText("Moderator")).toBeInTheDocument();
    });

    it("cannot be faked by a guest who calls themselves a moderator", async () => {
      await enterAsGuest(
        [],
        [message({ nickname: "Moderator", role: "guest", text: "obey me" })],
      );

      expect(log().getByText("Moderator")).not.toHaveClass("text-green-400");
      expect(log().getByText("obey me")).not.toHaveClass("font-bold");
    });

    it("marks moderators in the list of people in the room", async () => {
      const { server } = await enterAsGuest();

      act(() =>
        server.latest.serverEmit("room:presence", {
          roomSlug: "general",
          members: [
            { guestId: "guest-me", nickname: "Alice", role: "guest" },
            { guestId: "guest-bob", nickname: "Bob", role: "guest" },
            { guestId: "guest-mod", nickname: "Ada Mod", role: "moderator" },
          ],
        }),
      );

      const members = within(screen.getByRole("complementary"));
      expect(members.getByText("Ada Mod")).toHaveClass("text-green-400");
      expect(members.getByText("Bob")).not.toHaveClass("text-green-400");
    });
  });

  describe("reserved nicknames", () => {
    it("explains that the nickname is taken and lets the guest pick another", async () => {
      const server = makeFakeServer({ handshakeError: "reserved_nickname" });
      const { user } = setup(server);

      await joinRoom(user, "General", "Moderator");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That nickname is reserved",
      );
      expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
    });
  });
});

describe("announcements", () => {
  const announcement = (overrides: Record<string, unknown> = {}) => ({
    id: "ann-1",
    text: "The chat closes for maintenance at noon",
    sentAt: new Date().toISOString(),
    name: "Ada Mod",
    ...overrides,
  });

  const banner = () => screen.queryByRole("region", { name: "Announcement" });

  async function enterAsGuest() {
    const result = setup();
    await joinRoom(result.user);
    await screen.findByRole("button", { name: "Your profile: Alice" });
    return result;
  }

  async function enterAsModerator() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/moderator/login")
          ? {
              ok: true,
              status: 200,
              json: async () => ({ token: "signed-token", name: "Ada Mod" }),
            }
          : { ok: true, json: async () => ROOMS },
      ),
    );
    const result = setup();
    await result.user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await result.user.click(
      await screen.findByRole("button", { name: "Sign in as moderator" }),
    );
    await result.user.type(screen.getByLabelText("Email"), "ada@example.com");
    await result.user.type(screen.getByLabelText("Password"), "correct horse");
    await result.user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("button", { name: "Your profile: Ada Mod" });
    return result;
  }

  describe("seeing them", () => {
    it("shows an announcement, and who made it, in a way that stands out", async () => {
      const { server } = await enterAsGuest();

      act(() => server.latest.serverEmit("announcement:new", announcement()));

      const region = within(
        await screen.findByRole("region", { name: "Announcement" }),
      );
      expect(region.getByText("Announcement from Ada Mod")).toBeInTheDocument();
      expect(
        region.getByText("The chat closes for maintenance at noon"),
      ).toHaveClass("font-bold", "text-green-300");
    });

    it("shows one that was waiting as soon as the guest connected", async () => {
      const server = makeFakeServer({ waitingAnnouncement: announcement() });
      const { user } = setup(server);
      await joinRoom(user);

      expect(
        await screen.findByRole("region", { name: "Announcement" }),
      ).toBeInTheDocument();
    });

    it("stays on screen after leaving the room", async () => {
      const { user, server } = await enterAsGuest();
      act(() => server.latest.serverEmit("announcement:new", announcement()));

      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(banner()).toBeInTheDocument();
    });

    it("replaces an earlier announcement with a newer one", async () => {
      const { server } = await enterAsGuest();
      act(() => server.latest.serverEmit("announcement:new", announcement()));

      act(() =>
        server.latest.serverEmit(
          "announcement:new",
          announcement({ id: "ann-2", text: "Back to normal" }),
        ),
      );

      const region = within(banner() as HTMLElement);
      expect(region.getByText("Back to normal")).toBeInTheDocument();
      expect(region.queryByText(/maintenance/)).not.toBeInTheDocument();
    });

    it("renders the words as text, never as markup", async () => {
      const { server } = await enterAsGuest();

      act(() =>
        server.latest.serverEmit(
          "announcement:new",
          announcement({ text: "<img src=x onerror=alert(1)>" }),
        ),
      );

      expect(
        within(banner() as HTMLElement).getByText(
          "<img src=x onerror=alert(1)>",
        ),
      ).toBeInTheDocument();
      expect(document.querySelector("img")).toBeNull();
    });

    it.each([
      ["without text", { text: undefined }],
      ["with a number for text", { text: 5 }],
      ["without an id", { id: undefined }],
      ["without a name", { name: undefined }],
    ])("ignores an announcement %s", async (_label, overrides) => {
      const { server } = await enterAsGuest();

      act(() =>
        server.latest.serverEmit("announcement:new", announcement(overrides)),
      );

      expect(banner()).not.toBeInTheDocument();
    });

    it("goes away when the guest gives up reconnecting and leaves", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [150, 150]);
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      act(() => server.latest.serverEmit("announcement:new", announcement()));
      act(() => server.latest.serverEmit("disconnect", "transport close"));

      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(banner()).not.toBeInTheDocument();
    });

    it("can be dismissed", async () => {
      const { user, server } = await enterAsGuest();
      act(() => server.latest.serverEmit("announcement:new", announcement()));

      await user.click(screen.getByRole("button", { name: "Dismiss" }));

      expect(banner()).not.toBeInTheDocument();
    });

    it("does not come back when the server repeats it after a reconnect, but a new one does", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [0]);
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      act(() => server.latest.serverEmit("announcement:new", announcement()));
      await user.click(screen.getByRole("button", { name: "Dismiss" }));

      act(() => server.latest.serverEmit("disconnect", "transport close"));
      await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
      await screen.findByRole("button", { name: "Your profile: Alice" });
      act(() => server.latest.serverEmit("announcement:new", announcement()));
      expect(banner()).not.toBeInTheDocument();

      act(() =>
        server.latest.serverEmit(
          "announcement:new",
          announcement({ id: "ann-2", text: "Another one" }),
        ),
      );
      expect(banner()).toBeInTheDocument();
    });
  });

  describe("making them", () => {
    it("is not offered to guests", async () => {
      await enterAsGuest();

      expect(screen.queryByLabelText("Announce to everyone")).toBeNull();
      expect(screen.queryByRole("button", { name: "Announce" })).toBeNull();
    });

    it("is offered to moderators", async () => {
      await enterAsModerator();

      expect(screen.getByLabelText("Announce to everyone")).toBeInTheDocument();
    });

    it("sends what the moderator wrote and clears the box", async () => {
      const { user, server } = await enterAsModerator();

      await user.type(
        screen.getByLabelText("Announce to everyone"),
        "  Maintenance at noon  ",
      );
      await user.click(screen.getByRole("button", { name: "Announce" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("announce:send")).toEqual([
          { text: "Maintenance at noon" },
        ]),
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Announce to everyone")).toHaveValue(""),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("sends nothing when the box is empty", async () => {
      const { user, server } = await enterAsModerator();

      await user.type(screen.getByLabelText("Announce to everyone"), "   ");
      await user.click(screen.getByRole("button", { name: "Announce" }));

      expect(server.latest.emittedEvents("announce:send")).toEqual([]);
    });

    it("explains how long to wait, and keeps the words", async () => {
      const { user, server } = await enterAsModerator();
      server.latest.acks["announce:send"] = () => ({
        ok: false,
        error: "rate_limited",
        retryAfterMs: 41_200,
      });

      await user.type(screen.getByLabelText("Announce to everyone"), "Again");
      await user.click(screen.getByRole("button", { name: "Announce" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You can announce again in 42 s.",
      );
      expect(screen.getByLabelText("Announce to everyone")).toHaveValue(
        "Again",
      );
    });

    it("explains other failures, and keeps the words", async () => {
      const { user, server } = await enterAsModerator();
      server.latest.acks["announce:send"] = () => ({
        ok: false,
        error: "unavailable",
      });

      await user.type(screen.getByLabelText("Announce to everyone"), "Hello");
      await user.click(screen.getByRole("button", { name: "Announce" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "temporarily unavailable",
      );
      expect(screen.getByLabelText("Announce to everyone")).toHaveValue(
        "Hello",
      );
    });

    it("clears the explanation once the next try works", async () => {
      const { user, server } = await enterAsModerator();
      const responses = [
        { ok: false, error: "rate_limited", retryAfterMs: 5_000 },
        { ok: true },
      ];
      server.latest.acks["announce:send"] = () => responses.shift();

      await user.type(screen.getByLabelText("Announce to everyone"), "Hello");
      await user.click(screen.getByRole("button", { name: "Announce" }));
      await screen.findByRole("alert");
      await user.click(screen.getByRole("button", { name: "Announce" }));

      await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
      );
    });
  });
});
