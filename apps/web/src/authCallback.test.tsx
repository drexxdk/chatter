import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadAccount } from "./account";
import { AuthCallback, parseCallback } from "./components/AuthCallback";
import { loadSession, saveSession } from "./session";
const BIRTH_DATE = `${new Date().getUTCFullYear() - 30}-01-01`;

const SESSION = {
  token: "member-token",
  provider: "google",
  profile: {
    nickname: "Alice",
    username: "alice_w",
    picture: "lorelei:abc12345",
    avatar: "female",
    age: 30,
  },
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
  it("recognizes a staff sign-in without treating it as a member", () => {
    expect(parseCallback("#token=staff-token&staff=1&return=%2F")).toEqual({
      outcome: { kind: "staff", token: "staff-token" },
      returnPath: "/",
    });
  });
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
  it.each(
    ["token=old-token", "token=staff-token&staff=1"].flatMap((credentials) =>
      ["/", "/rooms/general"].map((returnPath) => ({
        credentials,
        returnPath,
      })),
    ),
  )(
    "does not show guest header controls while verifying $returnPath ($credentials)",
    async ({ credentials, returnPath }) => {
      stubServer({
        "GET /me": registered,
        "GET /me/staff": () => ({ body: { name: "Alice", admin: true } }),
      });
      const navigate = vi.fn();
      render(
        <AuthCallback
          hash={`#${credentials}&return=${encodeURIComponent(returnPath)}`}
          navigate={navigate}
        />,
      );

      expect(screen.queryByRole("banner")).toBeNull();
      expect(screen.queryByRole("link", { name: "Chatter" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
      if (returnPath === "/rooms/general") {
        expect(document.querySelector(".site-background")).toHaveAttribute(
          "data-room",
          "general",
        );
      } else {
        expect(document.querySelector(".site-background")).not.toHaveAttribute(
          "data-room",
        );
      }
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(returnPath));
    },
  );

  it("verifies staff callbacks and preserves staff identity without creating a member account", async () => {
    const request = stubServer({
      "GET /me/staff": () => ({
        body: { name: "Frederik Nielsen", admin: true },
      }),
    });
    const navigate = vi.fn();
    render(
      <AuthCallback
        hash="#token=staff-token&staff=1&return=%2F%3Fdialog%3Dprofile"
        navigate={navigate}
      />,
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/?dialog=profile"),
    );
    expect(loadAccount()).toBeNull();
    expect(loadSession()).toMatchObject({
      nickname: "Frederik Nielsen",
      token: "staff-token",
    });
    expect(request).toHaveBeenCalledWith(
      "http://localhost:4000/me/staff",
      expect.objectContaining({
        headers: { Authorization: "Bearer staff-token" },
      }),
    );
    expect(window.location.hash).toBe("");
  });

  it("does not trust a forged staff callback", async () => {
    stubServer({
      "GET /me/staff": () => ({
        status: 401,
        body: { error: "invalid_token" },
      }),
    });
    const navigate = vi.fn();
    render(<AuthCallback hash="#token=forged&staff=1" navigate={navigate} />);
    await screen.findByRole("alert");
    expect(navigate).not.toHaveBeenCalled();
    expect(loadSession()).toBeNull();
  });

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
        username: "alice_w",
        picture: "lorelei:abc12345",
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
    it("starts from who they were, and asks for the rest", async () => {
      const navigate = vi.fn();
      const fetchMock = stubServer({ "POST /auth/register": registered });
      saveSession({
        nickname: "Alice Guest",
        avatar: "female",
        age: 30,
        birthDate: BIRTH_DATE,
      });
      const user = userEvent.setup();

      render(
        <AuthCallback
          hash="#provider=google&ticket=t1&name=Somebody&return=%2Frooms%2Fgeneral"
          navigate={navigate}
        />,
      );

      expect(await screen.findByLabelText(/Display name/)).toHaveValue(
        "Alice Guest",
      );
      expect(screen.getByLabelText(/Username/)).toHaveValue("AliceGuest");
      expect(screen.getByLabelText("Day")).toHaveValue("01");
      expect(screen.getByLabelText("Month")).toHaveTextContent("January");
      expect(screen.getByLabelText("Year")).toHaveValue(BIRTH_DATE.slice(0, 4));
      expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();
      expect(navigate).not.toHaveBeenCalled();

      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/rooms/general"),
      );
      expect(bodyOfCall(fetchMock, "/auth/register")).toMatchObject({
        ticket: "t1",
        username: "AliceGuest",
        nickname: "Alice Guest",
        avatar: "female",
        birthDate: BIRTH_DATE,
      });
      expect(loadSession()).toEqual({
        nickname: "Alice",
        token: "member-token",
      });
    });

    it("says so when the ticket has run out", async () => {
      stubServer({
        "POST /auth/register": () => ({
          status: 401,
          body: { error: "invalid_ticket" },
        }),
      });
      saveSession({ nickname: "Alice" });
      const user = userEvent.setup();

      render(
        <AuthCallback
          hash="#provider=google&ticket=old&return=%2F"
          navigate={vi.fn()}
        />,
      );
      await user.click(await screen.findByRole("checkbox"));
      await user.click(
        await screen.findByRole("button", { name: "Create account" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The sign-in has expired",
      );
    });
  });

  describe("for somebody new, who chooses who to be", () => {
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

    const pictures = () =>
      screen.getAllByRole("radio", {
        name: /^Avatar \d$/,
      }) as HTMLInputElement[];

    it("is asked for a username, a display name and an avatar, with the name from the provider to start from", async () => {
      open();

      expect(
        await screen.findByRole("heading", { name: "Create your account" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Google has confirmed who you are/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Display name/)).toHaveValue(
        "Alice Provider",
      );
      expect(screen.getByLabelText(/Username/)).toHaveValue("AliceProvider");
      expect(
        screen.getByRole("radio", { name: "Not specified" }),
      ).toBeChecked();
    });

    it("has an avatar chosen already, at random, so that one is always there", async () => {
      open();
      await screen.findByLabelText(/Display name/);

      const options = pictures();

      expect(options).toHaveLength(8);
      expect(options.filter((option) => option.checked)).toHaveLength(1);
      expect(options[0]?.value).toMatch(
        /^(lorelei|pixel-art|critters|thumbs):[a-z0-9]{10}$/,
      );
    });

    it("brings other avatars to choose from, and keeps the chosen one", async () => {
      const { user } = open();
      await screen.findByLabelText(/Display name/);
      const before = pictures().map((option) => option.value);
      const chosen = before[0];

      await user.click(
        screen.getByRole("button", { name: "Show other avatars" }),
      );

      const after = pictures().map((option) => option.value);
      expect(after[0]).toBe(chosen);
      expect(after.slice(1)).not.toEqual(before.slice(1));
      expect(pictures()[0]).toBeChecked();
    });

    it("starts empty when the name from the provider is not one that is allowed", async () => {
      open("#provider=google&ticket=t1&name=%3Cscript%3E&return=%2F");

      expect(await screen.findByLabelText(/Display name/)).toHaveValue("");
      expect(screen.getByLabelText(/Username/)).toHaveValue("");
    });

    it("does not let a space into the username", async () => {
      const { user } = open("#provider=google&ticket=t1&return=%2F");
      const username = await screen.findByLabelText(/Username/);

      await user.type(username, "alice w x");

      expect(username).toHaveValue("alicewx");
    });

    it("needs the terms accepted first, and says why", async () => {
      const { user, navigate } = open();
      await screen.findByLabelText(/Display name/);

      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(
        await screen.findByText(
          "To continue you need to be 18 or older and accept the terms.",
        ),
      ).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("needs a valid username and a valid display name", async () => {
      const { user, navigate } = open("#provider=google&ticket=t1&return=%2F");
      await user.click(await screen.findByRole("checkbox"));

      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(screen.getByLabelText(/Username/)).toBeInvalid();
      expect(screen.getByLabelText(/Display name/)).toBeInvalid();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("makes the account with what they chose, tidies the display name, remembers the terms, and goes on", async () => {
      const { user, navigate, fetchMock } = open();
      const username = await screen.findByLabelText(/Username/);
      await user.clear(username);
      await user.type(username, "alice_w");
      const displayName = screen.getByLabelText(/Display name/);
      await user.clear(displayName);
      await user.type(displayName, "  Alice    Wonder ");
      fireEvent.change(screen.getByLabelText("Day"), {
        target: { value: "01" },
      });
      await user.click(screen.getByLabelText("Month"));
      await user.click(await screen.findByRole("option", { name: "January" }));
      fireEvent.change(screen.getByLabelText("Year"), {
        target: { value: BIRTH_DATE.slice(0, 4) },
      });
      await user.click(screen.getByRole("radio", { name: "Female" }));
      await user.click(screen.getByRole("radio", { name: "Avatar 2" }));
      const chosen = (
        screen.getByRole("radio", { name: "Avatar 2" }) as HTMLInputElement
      ).value;
      await user.click(screen.getByRole("checkbox"));

      await user.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/rooms/general"),
      );
      expect(bodyOfCall(fetchMock, "/auth/register")).toEqual({
        ticket: "t1",
        username: "alice_w",
        nickname: "Alice Wonder",
        picture: chosen,
        avatar: "female",
        birthDate: BIRTH_DATE,
      });
      expect(loadAccount()).toMatchObject({ nickname: "Alice" });
      expect(localStorage.getItem("chatter.terms")).not.toBeNull();
    });

    it.each([
      ["reserved_username", "That username is taken or reserved"],
      ["reserved_nickname", "That display name is taken or reserved"],
      ["invalid_username", "That username isn't allowed"],
      ["invalid_nickname", "That display name isn't allowed"],
    ])(
      "is told when the server says %s, and can choose another",
      async (code, text) => {
        const navigate = vi.fn();
        stubServer({
          "POST /auth/register": () => ({ status: 409, body: { error: code } }),
        });
        render(
          <AuthCallback
            hash="#provider=google&ticket=t1&name=Alice&return=%2F"
            navigate={navigate}
          />,
        );
        const user = userEvent.setup();
        await user.click(await screen.findByRole("checkbox"));

        await user.click(
          screen.getByRole("button", { name: "Create account" }),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(text);
        const rejected = screen.getByLabelText(
          code.endsWith("_nickname") ? /Display name/ : /Username/,
        );
        expect(rejected).toBeInvalid();
        expect(rejected).toHaveFocus();
        expect(rejected).toHaveAccessibleDescription(
          expect.stringContaining(text),
        );
        expect(
          screen.getByRole("button", { name: "Create account" }),
        ).toBeEnabled();
        expect(navigate).not.toHaveBeenCalled();
        await user.type(rejected, "2");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(rejected).toBeValid();
      },
    );

    it("keeps a display-name conflict when only username changes, then clears it when the display name is corrected", async () => {
      const navigate = vi.fn();
      let corrected = false;
      const fetchMock = stubServer({
        "POST /auth/register": () =>
          corrected
            ? registered()
            : { status: 409, body: { error: "reserved_nickname" } },
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
        "That display name is taken or reserved",
      );
      const username = screen.getByLabelText(/Username/);
      await user.clear(username);
      await user.type(username, "alice123");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That display name is taken or reserved",
      );
      const displayName = screen.getByLabelText(/Display name/);
      await user.clear(displayName);
      await user.type(displayName, "Alice New");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(displayName).toBeValid();
      corrected = true;
      await user.click(screen.getByRole("button", { name: "Create account" }));
      await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
      const requests = fetchMock.mock.calls.filter(
        ([url]) => new URL(url).pathname === "/auth/register",
      );
      expect(JSON.parse(String(requests.at(-1)?.[1]?.body))).toMatchObject({
        username: "alice123",
        nickname: "Alice New",
      });
    });

    it("starts the terms box unchecked even when acceptance was saved", async () => {
      localStorage.setItem("chatter.terms", "unknown");
      const { user, navigate } = open();

      await screen.findByLabelText(/Display name/);
      expect(screen.getByRole("checkbox")).not.toBeChecked();

      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(navigate).not.toHaveBeenCalled();
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "Create account" }));
      await waitFor(() => expect(navigate).toHaveBeenCalled());
    });

    it("can be given up, and then goes back to where they were without an account", async () => {
      const { user, navigate } = open();

      await user.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(navigate).toHaveBeenCalledWith("/rooms/general");
      expect(loadAccount()).toBeNull();
    });

    it("keeps the frame of the site: the header with direct settings", async () => {
      open();

      const header = within(await screen.findByRole("banner"));

      expect(header.getByRole("link", { name: "Chatter" })).toHaveAttribute(
        "href",
        "/",
      );
      expect(
        header.getByRole("button", { name: "Settings" }),
      ).toBeInTheDocument();
    });
  });
});
