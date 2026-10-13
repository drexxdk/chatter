import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadAccount } from "./account";
import { AuthCallback, parseCallback } from "./components/AuthCallback";
import { loadSession, saveSession } from "./session";

const SESSION = {
  token: "member-token",
  provider: "google",
  profile: { nickname: "Alice", avatar: "female", age: 30 },
  expiresAt: Date.now() + 30 * 86_400_000,
};

type Route = () => { status?: number; body: unknown };

// The chat-server's answers; a route that is not given is a 404.
function stubServer(routes: Record<string, Route> = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const route = routes[key];

    if (!route) return Response.json({}, { status: 404 });

    const { status = 200, body } = route();
    return Response.json(body, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const registered = () => ({ body: SESSION });
const bodyOfCall = (fetchMock: ReturnType<typeof stubServer>, path: string) => {
  const call = fetchMock.mock.calls.find(
    ([url]) => new URL(url).pathname === path,
  );
  return JSON.parse(String(call?.[1]?.body ?? "null"));
};

beforeEach(() => {
  window.history.replaceState(null, "", "/auth/callback#secret=1");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what the chat-server sends the browser back with", () => {
  it("is a session for somebody who has an account", () => {
    expect(parseCallback("#token=abc&return=%2Frooms%2Fmusic")).toEqual({
      outcome: { kind: "token", token: "abc" },
      returnPath: "/rooms/music",
    });
  });

  it("is a ticket for somebody who has not, with the name the provider has for them", () => {
    expect(
      parseCallback("#provider=google&ticket=t1&name=Alice&return=%2F"),
    ).toEqual({
      outcome: {
        kind: "ticket",
        ticket: "t1",
        provider: "google",
        name: "Alice",
      },
      returnPath: "/",
    });
  });

  it("is an error, which wins over anything else in it", () => {
    expect(parseCallback("#error=denied&token=abc&return=%2F")).toEqual({
      outcome: { kind: "error", code: "denied" },
      returnPath: "/",
    });
  });

  it.each(["", "#", "#nothing=here", "#provider=google"])(
    "is a failure when there is nothing in it (%j)",
    (hash) => {
      expect(parseCallback(hash).outcome).toEqual({
        kind: "error",
        code: "failed",
      });
    },
  );

  it.each([
    [null, "/"],
    ["//evil.example.com", "/"],
    ["https://evil.example.com", "/"],
    ["/\\evil.example.com", "/"],
    ["/auth/callback", "/"],
    ["rooms/music", "/"],
    ["/rooms/music", "/rooms/music"],
  ])("sends %j on to %s", (path, expected) => {
    const hash =
      path === null
        ? "#token=t"
        : `#token=t&return=${encodeURIComponent(path)}`;

    expect(parseCallback(hash).returnPath).toBe(expected);
  });
});

describe("the page the providers send the browser back to", () => {
  it("says what went wrong, and offers the way back to where the guest was", async () => {
    render(
      <AuthCallback
        hash="#error=denied&return=%2Frooms%2Fmusic"
        navigate={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You did not allow the sign-in.",
    );
    expect(
      screen.getByRole("link", { name: "Back to Chatter" }),
    ).toHaveAttribute("href", "/rooms/music");
  });

  it("takes the ticket and the token out of the address, so they are not left in the history", () => {
    render(<AuthCallback hash="#error=denied" navigate={vi.fn()} />);

    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/auth/callback");
  });

  describe("for somebody who has an account", () => {
    it("keeps the account in this browser, and goes on to the room, where the session brings them in", async () => {
      const navigate = vi.fn();
      const fetchMock = stubServer({ "GET /me": registered });
      saveSession({ nickname: "Old guest" });

      render(
        <AuthCallback
          hash="#token=old-token&return=%2Frooms%2Fgeneral"
          navigate={navigate}
        />,
      );

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/rooms/general"),
      );
      expect(
        (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)
          .Authorization,
      ).toBe("Bearer old-token");
      expect(loadAccount()).toMatchObject({
        token: "member-token",
        provider: "google",
        nickname: "Alice",
        avatar: "female",
        age: 30,
      });
      expect(loadSession()).toEqual({
        nickname: "Alice",
        token: "member-token",
      });
    });

    it("leaves no session when it goes back to the lobby", async () => {
      const navigate = vi.fn();
      stubServer({ "GET /me": registered });
      saveSession({ nickname: "Old guest" });

      render(<AuthCallback hash="#token=t&return=%2F" navigate={navigate} />);

      await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
      expect(loadSession()).toBeNull();
      expect(loadAccount()).not.toBeNull();
    });

    it("says so when the server does not accept the token", async () => {
      const navigate = vi.fn();
      stubServer({
        "GET /me": () => ({ status: 401, body: { error: "invalid_token" } }),
      });

      render(<AuthCallback hash="#token=t" navigate={navigate} />);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your session has expired",
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(loadAccount()).toBeNull();
    });
  });

  describe("for a guest who connects a provider", () => {
    it("makes the account with the nickname, avatar and age they had, and goes on without asking anything", async () => {
      const navigate = vi.fn();
      const fetchMock = stubServer({ "POST /auth/register": registered });
      saveSession({ nickname: "Alice", avatar: "female", age: 30 });

      render(
        <AuthCallback
          hash="#provider=google&ticket=t1&name=Somebody&return=%2Frooms%2Fgeneral"
          navigate={navigate}
        />,
      );

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/rooms/general"),
      );
      expect(bodyOfCall(fetchMock, "/auth/register")).toEqual({
        ticket: "t1",
        nickname: "Alice",
        avatar: "female",
        age: 30,
      });
      expect(loadAccount()).toMatchObject({ nickname: "Alice" });
      expect(loadSession()).toEqual({
        nickname: "Alice",
        token: "member-token",
      });
    });

    it("lets them choose another nickname when theirs is somebody else's now", async () => {
      const navigate = vi.fn();
      stubServer({
        "POST /auth/register": () => ({
          status: 409,
          body: { error: "reserved_nickname" },
        }),
      });
      saveSession({ nickname: "Taken" });

      render(
        <AuthCallback
          hash="#provider=google&ticket=t1&return=%2F"
          navigate={navigate}
        />,
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That nickname is reserved",
      );
      expect(screen.getByLabelText(/Nickname/)).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("says so when the ticket has run out", async () => {
      stubServer({
        "POST /auth/register": () => ({
          status: 401,
          body: { error: "invalid_ticket" },
        }),
      });
      saveSession({ nickname: "Alice" });

      render(
        <AuthCallback
          hash="#provider=google&ticket=old&return=%2F"
          navigate={vi.fn()}
        />,
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The sign-in has expired",
      );
    });
  });

  describe("for somebody new, who chooses a nickname", () => {
    beforeEach(() => {
      localStorage.removeItem("chatter.terms");
    });

    const open = (
      hash = "#provider=google&ticket=t1&name=Alice%20Provider&return=%2Frooms%2Fgeneral",
    ) => {
      const navigate = vi.fn();
      const fetchMock = stubServer({ "POST /auth/register": registered });
      render(<AuthCallback hash={hash} navigate={navigate} />);

      return { navigate, fetchMock, user: userEvent.setup() };
    };

    it("is asked who they want to be, with the name from the provider to start from", async () => {
      open();

      expect(
        await screen.findByRole("heading", { name: "Create your account" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Google has confirmed who you are/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Nickname/)).toHaveValue("Alice Provider");
      expect(
        screen.getByRole("radio", { name: "Not specified" }),
      ).toBeChecked();
    });

    it("starts empty when the name from the provider is not one that is allowed", async () => {
      open("#provider=google&ticket=t1&name=%3Cscript%3E&return=%2F");

      expect(await screen.findByLabelText(/Nickname/)).toHaveValue("");
    });

    it("needs the terms accepted first, and says why", async () => {
      const { user, navigate } = open();
      await screen.findByLabelText(/Nickname/);

      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(
        await screen.findByText(
          "To continue you need to be 18 or older and accept the terms.",
        ),
      ).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("needs a valid nickname", async () => {
      const { user, navigate } = open("#provider=google&ticket=t1&return=%2F");
      await user.click(await screen.findByRole("checkbox"));

      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(screen.getByLabelText(/Nickname/)).toBeInvalid();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("makes the account with what they chose, remembers the terms, and goes on", async () => {
      const { user, navigate, fetchMock } = open();
      const nickname = await screen.findByLabelText(/Nickname/);
      await user.clear(nickname);
      await user.type(nickname, "Alice");
      await user.type(screen.getByLabelText("Age"), "30");
      await user.click(screen.getByRole("radio", { name: "Female" }));
      await user.click(screen.getByRole("checkbox"));

      await user.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/rooms/general"),
      );
      expect(bodyOfCall(fetchMock, "/auth/register")).toEqual({
        ticket: "t1",
        nickname: "Alice",
        avatar: "female",
        age: 30,
      });
      expect(loadAccount()).toMatchObject({ nickname: "Alice" });
      expect(localStorage.getItem("chatter.terms")).not.toBeNull();
    });

    it("is told when the nickname is taken, and can choose another", async () => {
      const navigate = vi.fn();
      stubServer({
        "POST /auth/register": () => ({
          status: 409,
          body: { error: "reserved_nickname" },
        }),
      });
      render(
        <AuthCallback
          hash="#provider=google&ticket=t1&name=Alice&return=%2F"
          navigate={navigate}
        />,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole("checkbox"));

      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That nickname is reserved",
      );
      expect(
        screen.getByRole("button", { name: "Create account" }),
      ).toBeEnabled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("only reminds somebody who has accepted the terms already", async () => {
      localStorage.setItem("chatter.terms", "unknown");
      const { user, navigate } = open();

      await screen.findByLabelText(/Nickname/);
      expect(screen.queryByRole("checkbox")).toBeNull();

      await user.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
    });

    it("can be given up, and then goes back to where they were without an account", async () => {
      const { user, navigate } = open();

      await user.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(navigate).toHaveBeenCalledWith("/rooms/general");
      expect(loadAccount()).toBeNull();
    });

    it("keeps the frame of the site: the header with the menu", async () => {
      open();

      const header = within(await screen.findByRole("banner"));

      expect(header.getByRole("link", { name: "Chatter" })).toHaveAttribute(
        "href",
        "/",
      );
      expect(header.getByRole("button", { name: "Menu" })).toBeInTheDocument();
    });
  });
});
