import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [
  {
    id: 1,
    name: "General",
    slug: "general",
    maxMembers: 100,
    description: "Open chat",
  },
  { id: 2, name: "Music", slug: "music", maxMembers: 30, description: null },
  // Payload sends null when a room's limit field is left empty.
  {
    id: 3,
    name: "Lounge",
    slug: "lounge",
    maxMembers: null,
    description: null,
  },
];

function stubRooms(
  response: () => Promise<unknown> = async () => ({
    ok: true,
    json: async () => ROOMS,
  }),
) {
  const fetchMock = vi.fn(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setup(server = makeFakeServer(), reconnectDelaysMs?: number[]) {
  const user = userEvent.setup();
  const { unmount } = render(
    <App
      createSocket={server.createSocket}
      reconnectDelaysMs={reconnectDelaysMs}
    />,
  );
  return { user, server, unmount };
}

async function joinRoom(
  user: ReturnType<typeof userEvent.setup>,
  roomName = "General",
  nickname = "Alice",
) {
  await user.click(
    await screen.findByRole("button", { name: `Join ${roomName}` }),
  );
  await user.type(await screen.findByLabelText("Nickname"), nickname);
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

// A fixed clock for messages whose order matters.
const at = (second: number) =>
  new Date(Date.UTC(2026, 9, 3, 12, 0, second)).toISOString();

function message(overrides: Partial<Record<string, string>> = {}) {
  return {
    id: crypto.randomUUID(),
    roomSlug: "general",
    guestId: "guest-bob",
    nickname: "Bob",
    text: "hello there",
    sentAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  stubRooms();
});

describe("lobby", () => {
  it("lists the public rooms from the chat server", async () => {
    setup();

    expect(screen.getByRole("status")).toHaveTextContent("Loading rooms");
    expect(
      await screen.findByRole("heading", { name: "General" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(screen.getByText("Open chat")).toBeInTheDocument();
    expect(screen.getByText("Up to 30 people")).toBeInTheDocument();
  });

  it("shows no capacity for a room without a limit", async () => {
    setup();

    const lounge = (await screen.findByRole("heading", { name: "Lounge" }))
      .parentElement as HTMLElement;

    expect(lounge).not.toHaveTextContent(/Up to/);
    expect(lounge).not.toHaveTextContent(/null|undefined|NaN/);
    // The other rooms still show theirs.
    expect(screen.getAllByText(/Up to/)).toHaveLength(2);
  });

  it("shows an error and lets the user retry when rooms fail to load", async () => {
    const fetchMock = stubRooms(async () => ({ ok: false, status: 503 }));
    const { user } = setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the rooms.",
    );

    fetchMock.mockImplementation(
      async () => ({ ok: true, json: async () => ROOMS }) as never,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { name: "General" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows an empty state when there are no rooms", async () => {
    stubRooms(async () => ({ ok: true, json: async () => [] }));
    setup();

    expect(
      await screen.findByText("No rooms are available yet."),
    ).toBeInTheDocument();
  });
});

describe("joining a room", () => {
  it("asks for a nickname, connects with it, then joins the chosen room", async () => {
    const { user, server } = setup();

    await joinRoom(user, "General", "  Alice  ");

    expect(await screen.findByText("Chatting as Alice")).toBeInTheDocument();
    expect(server.createSocket).toHaveBeenCalledWith("Alice");
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
    ]);
    expect(
      screen.getByRole("heading", { name: "General", level: 2 }),
    ).toBeInTheDocument();
  });

  it("lists the guest as a member right after joining", async () => {
    const { user } = setup();

    await joinRoom(user);

    // The server sends presence before it acknowledges the join, so it must not be dropped.
    expect(
      await screen.findByRole("heading", { name: "In this room (1)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("rejects an invalid nickname locally without connecting", async () => {
    const { user, server } = setup();

    await joinRoom(user, "General", "<b>");

    expect(screen.getByLabelText("Nickname")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(server.createSocket).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and explains a server-side rejection", async () => {
    const { user, server } = setup(
      makeFakeServer({ handshakeError: "banned" }),
    );

    await joinRoom(user);

    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toHaveTextContent("You are banned from this chat.");
    expect(server.latest.emittedEvents("room:join")).toEqual([]);
  });

  it("reports an unreachable server as a connection problem", async () => {
    const { user } = setup(
      makeFakeServer({ handshakeError: "websocket error" }),
    );

    await joinRoom(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the chat server.",
    );
  });

  it("explains when too many connections come from the same network", async () => {
    const { user } = setup(
      makeFakeServer({ handshakeError: "too_many_connections" }),
    );

    await joinRoom(user);

    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toHaveTextContent("Too many connections from your network.");
  });

  it("lets the user cancel the nickname dialog", async () => {
    const { user, server } = setup();

    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.createSocket).not.toHaveBeenCalled();
  });

  it("returns to the lobby with an explanation when the room is full", async () => {
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: false, error: "room_full" });
    const { user } = setup(server);

    await joinRoom(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This room is full.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
  });
});

describe("inside a room", () => {
  async function enterRoom() {
    const result = setup();
    await joinRoom(result.user);
    await screen.findByText("Chatting as Alice");
    return result;
  }

  it("shows who is in the room and marks the current guest", async () => {
    const { server } = await enterRoom();

    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [
          { guestId: "guest-me", nickname: "Alice" },
          { guestId: "guest-bob", nickname: "Bob" },
        ],
      }),
    );

    expect(
      screen.getByRole("heading", { name: "In this room (2)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("ignores presence and messages that belong to another room", async () => {
    const { server } = await enterRoom();

    act(() => {
      server.latest.serverEmit("room:presence", {
        roomSlug: "music",
        members: [{ guestId: "x", nickname: "Elsewhere" }],
      });
      server.latest.serverEmit(
        "message:new",
        message({ roomSlug: "music", text: "wrong room" }),
      );
    });

    expect(screen.queryByText("Elsewhere")).not.toBeInTheDocument();
    expect(screen.queryByText("wrong room")).not.toBeInTheDocument();
  });

  it("shows incoming messages in order", async () => {
    const { server } = await enterRoom();

    act(() => {
      server.latest.serverEmit("message:new", message({ text: "first" }));
      server.latest.serverEmit("message:new", message({ text: "second" }));
    });

    const log = screen.getByRole("log");
    expect(
      within(log)
        .getAllByText(/first|second/)
        .map((node) => node.textContent),
    ).toEqual(["first", "second"]);
  });

  it("renders message text literally instead of as HTML", async () => {
    const { server } = await enterRoom();

    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({ text: '<img src=x onerror="alert(1)">' }),
      ),
    );

    expect(
      screen.getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("sends a trimmed message and clears the input", async () => {
    const { user, server } = await enterRoom();

    await user.type(screen.getByLabelText("Message"), "  hi all  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toHaveValue(""),
    );
    expect(server.latest.emittedEvents("message:send")).toEqual([
      { text: "hi all" },
    ]);
  });

  it("does not send an empty message", async () => {
    const { user, server } = await enterRoom();

    await user.type(screen.getByLabelText("Message"), "   ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(server.latest.emittedEvents("message:send")).toEqual([]);
  });

  it("keeps the draft and explains why when a message is rejected", async () => {
    const { user, server } = await enterRoom();
    server.latest.acks["message:send"] = () => ({
      ok: false,
      error: "rate_limited",
    });

    await user.type(screen.getByLabelText("Message"), "too fast");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You're sending messages too fast.",
    );
    expect(screen.getByLabelText("Message")).toHaveValue("too fast");
  });

  it("tells the guest how long to wait when a message is refused", async () => {
    const { user, server } = await enterRoom();
    server.latest.acks["message:send"] = () => ({
      ok: false,
      error: "rate_limited",
      retryAfterMs: 6_200,
    });

    await user.type(screen.getByLabelText("Message"), "too fast");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // Rounded up, so the guest is never told to try again too early.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can send again in 7 s.",
    );
    expect(screen.getByLabelText("Message")).toHaveValue("too fast");
  });

  describe("slow mode", () => {
    async function enterSlowRoom(slowModeSeconds?: number | null) {
      stubRooms(async () => ({
        ok: true,
        json: async () => [{ ...ROOMS[0], slowModeSeconds }, ROOMS[1]],
      }));
      const result = setup();
      await joinRoom(result.user);
      await screen.findByText("Chatting as Alice");
      return result;
    }

    it("tells the guest how often they may write", async () => {
      await enterSlowRoom(10);

      expect(
        screen.getByText("Slow mode: one message every 10 s."),
      ).toBeInTheDocument();
    });

    it.each([
      ["without the setting", undefined],
      ["with it empty", null],
    ])("says nothing about it in a room %s", async (_label, value) => {
      await enterSlowRoom(value);

      expect(screen.queryByText(/Slow mode/)).not.toBeInTheDocument();
    });
  });

  it("leaves the room and reuses the connection for the next room", async () => {
    const { user, server } = await enterRoom();

    await user.click(screen.getByRole("button", { name: "Leave room" }));
    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("room:leave")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Join Music" }));

    expect(
      await screen.findByRole("heading", { name: "Music", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.createSocket).toHaveBeenCalledTimes(1);
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
      { slug: "music" },
    ]);
  });

  it("explains an inactivity disconnect and returns to the lobby", async () => {
    const { server } = await enterRoom();

    act(() => {
      server.latest.serverEmit("kicked", { reason: "inactivity" });
      server.latest.serverEmit("disconnect", "io server disconnect");
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You were disconnected for being inactive.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    // A deliberate disconnect by the server must not be treated as a dropped connection.
    expect(server.createSocket).toHaveBeenCalledTimes(1);
  });

  it("closes the connection when the app unmounts", async () => {
    const { user, server, unmount } = setup();
    await joinRoom(user);
    await screen.findByText("Chatting as Alice");
    expect(server.latest.disconnected).toBe(false);

    unmount();

    expect(server.latest.disconnected).toBe(true);
  });
});

describe("message history", () => {
  const shown = () =>
    within(screen.getByRole("log"))
      .queryAllByText(/^(earlier|between|later|elsewhere)/)
      .map((node) => node.textContent);

  async function joinWithHistory(history: unknown, live: unknown[] = []) {
    const server = makeFakeServer();
    server.acks["room:join"] = () => {
      // The server delivers live messages before it acknowledges the join.
      live.forEach((m) => server.latest.serverEmit("message:new", m));
      return { ok: true, history };
    };
    const result = setup(server);
    await joinRoom(result.user);
    await screen.findByText("Chatting as Alice");
    return result;
  }

  it("shows the room's earlier messages to a guest who joins", async () => {
    await joinWithHistory([
      message({ text: "earlier one", sentAt: at(1) }),
      message({ text: "earlier two", sentAt: at(2) }),
    ]);

    expect(shown()).toEqual(["earlier one", "earlier two"]);
  });

  it("shows a message once when it is both in the history and delivered live", async () => {
    const duplicate = message({ text: "earlier one", sentAt: at(1) });

    await joinWithHistory([duplicate], [duplicate]);

    expect(shown()).toEqual(["earlier one"]);
  });

  it("puts history and live messages in the order they were sent", async () => {
    await joinWithHistory(
      [
        message({ text: "earlier one", sentAt: at(1) }),
        message({ text: "later one", sentAt: at(3) }),
      ],
      [message({ text: "between them", sentAt: at(2) })],
    );

    expect(shown()).toEqual(["earlier one", "between them", "later one"]);
  });

  it("keeps messages that arrive after joining at the end", async () => {
    const { server } = await joinWithHistory([
      message({ text: "earlier one", sentAt: at(1) }),
    ]);

    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({ text: "later one", sentAt: new Date().toISOString() }),
      ),
    );

    expect(shown()).toEqual(["earlier one", "later one"]);
  });

  it("ignores history entries that belong to another room", async () => {
    await joinWithHistory([
      message({ text: "earlier one", sentAt: at(1) }),
      message({ roomSlug: "music", text: "elsewhere", sentAt: at(2) }),
    ]);

    expect(shown()).toEqual(["earlier one"]);
  });

  it.each([
    ["missing", undefined],
    ["not a list", "oops"],
    ["null", null],
  ])("copes with a history that is %s", async (_label, history) => {
    await joinWithHistory(history);

    expect(shown()).toEqual([]);
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("leaves a room's history behind when moving to another room", async () => {
    const { user } = await joinWithHistory([
      message({ text: "earlier one", sentAt: at(1) }),
    ]);

    await user.click(screen.getByRole("button", { name: "Leave room" }));
    await screen.findByRole("heading", { name: "Public rooms" });
    await user.click(screen.getByRole("button", { name: "Join Music" }));
    await screen.findByRole("heading", { name: "Music", level: 2 });

    expect(shown()).toEqual([]);
  });
});

describe("banned authors", () => {
  const PLACEHOLDER = "This user was banned";
  const placeholder = (id: string, sentAt: string, roomSlug = "general") => ({
    id,
    roomSlug,
    sentAt,
    banned: true,
  });

  const log = () => within(screen.getByRole("log"));

  async function joinWith(history: unknown[] = [], live: unknown[] = []) {
    const server = makeFakeServer();
    server.acks["room:join"] = () => {
      live.forEach((m) => server.latest.serverEmit("message:new", m));
      return { ok: true, history };
    };
    const result = setup(server);
    await joinRoom(result.user);
    await screen.findByText("Chatting as Alice");
    return result;
  }

  const redact = (
    server: ReturnType<typeof makeFakeServer>,
    payload: unknown,
  ) => act(() => server.latest.serverEmit("message:redacted", payload));

  it("replaces a message on screen when the server says its author was banned", async () => {
    const bad = message({ text: "something awful", nickname: "Mallory" });
    const { server } = await joinWith();
    act(() => server.latest.serverEmit("message:new", bad));
    expect(log().getByText("something awful")).toBeInTheDocument();

    redact(server, { roomSlug: "general", ids: [bad.id], guestIds: [] });

    expect(log().queryByText("something awful")).not.toBeInTheDocument();
    expect(log().queryByText("Mallory")).not.toBeInTheDocument();
    expect(log().getByText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("shows the placeholder in red", async () => {
    const bad = message();
    const { server } = await joinWith([], [bad]);

    redact(server, { roomSlug: "general", ids: [bad.id], guestIds: [] });

    expect(log().getByText(PLACEHOLDER)).toHaveClass("text-red-400");
  });

  it("also replaces that guest's older messages, which the server may no longer hold", async () => {
    const older = message({
      guestId: "guest-mal",
      text: "old rant",
      sentAt: at(1),
    });
    const newer = message({
      guestId: "guest-mal",
      text: "new rant",
      sentAt: at(3),
    });
    const innocent = message({
      guestId: "guest-bob",
      text: "fine",
      sentAt: at(2),
    });
    const { server } = await joinWith([], [older, innocent, newer]);

    redact(server, { roomSlug: "general", ids: [], guestIds: ["guest-mal"] });

    expect(log().queryByText("old rant")).not.toBeInTheDocument();
    expect(log().queryByText("new rant")).not.toBeInTheDocument();
    expect(log().getByText("fine")).toBeInTheDocument();
    expect(log().getAllByText(PLACEHOLDER)).toHaveLength(2);
  });

  it("leaves everyone else's messages alone", async () => {
    const bad = message({ text: "awful" });
    const fine = message({
      guestId: "guest-carol",
      nickname: "Carol",
      text: "lovely",
    });
    const { server } = await joinWith([], [bad, fine]);

    redact(server, { roomSlug: "general", ids: [bad.id], guestIds: [] });

    expect(log().getByText("lovely")).toBeInTheDocument();
    expect(log().getByText("Carol")).toBeInTheDocument();
  });

  it("keeps the order of the conversation", async () => {
    const first = message({ text: "first", sentAt: at(1) });
    const bad = message({ text: "awful", sentAt: at(2) });
    const last = message({ text: "last", sentAt: at(3) });
    const { server } = await joinWith([], [first, bad, last]);

    redact(server, { roomSlug: "general", ids: [bad.id], guestIds: [] });

    const items = within(screen.getByRole("log")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("first"),
      expect.stringContaining(PLACEHOLDER),
      expect.stringContaining("last"),
    ]);
  });

  it("ignores a notice about another room", async () => {
    const bad = message({ text: "awful" });
    const { server } = await joinWith([], [bad]);

    redact(server, {
      roomSlug: "music",
      ids: [bad.id],
      guestIds: [bad.guestId],
    });

    expect(log().getByText("awful")).toBeInTheDocument();
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["no lists", { roomSlug: "general" }],
    ["lists of the wrong kind", { roomSlug: "general", ids: "x", guestIds: 3 }],
  ])("copes with a notice that carries %s", async (_label, payload) => {
    const bad = message({ text: "awful" });
    const { server } = await joinWith([], [bad]);

    redact(server, payload);

    expect(log().getByText("awful")).toBeInTheDocument();
  });

  it("shows a placeholder that comes with the room's history", async () => {
    await joinWith([
      message({ text: "before", sentAt: at(1) }),
      placeholder("gone", at(2)),
      message({ text: "after", sentAt: at(3) }),
    ]);

    expect(log().getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(log().getByText("before")).toBeInTheDocument();
    expect(log().getByText("after")).toBeInTheDocument();
  });

  // The guest may already have seen the message live; the history is newer news about it.
  it("lets a placeholder in the history replace a copy that was delivered live", async () => {
    const bad = message({ text: "awful", sentAt: at(1) });

    await joinWith([placeholder(bad.id, bad.sentAt)], [bad]);

    expect(log().queryByText("awful")).not.toBeInTheDocument();
    expect(log().getAllByText(PLACEHOLDER)).toHaveLength(1);
  });

  it("does not let a late live copy bring a replaced message back", async () => {
    const bad = message({ text: "awful", sentAt: at(1) });
    const { server } = await joinWith([placeholder(bad.id, bad.sentAt)]);

    act(() => server.latest.serverEmit("message:new", bad));

    expect(log().queryByText("awful")).not.toBeInTheDocument();
    expect(log().getAllByText(PLACEHOLDER)).toHaveLength(1);
  });

  it("ignores a placeholder that belongs to another room", async () => {
    await joinWith([placeholder("x", at(1), "music")]);

    expect(log().queryByText(PLACEHOLDER)).not.toBeInTheDocument();
  });

  it("tells a banned guest why they were disconnected and returns to the lobby", async () => {
    const { server } = await joinWith();

    act(() => {
      server.latest.serverEmit("kicked", { reason: "banned" });
      server.latest.serverEmit("disconnect", "io server disconnect");
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are banned from this chat.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(server.createSocket).toHaveBeenCalledTimes(1);
  });
});

describe("losing the connection", () => {
  const DROP = "transport close";

  async function enterRoom(server = makeFakeServer(), delays = [5, 5, 5]) {
    const result = setup(server, delays);
    await joinRoom(result.user);
    await screen.findByText("Chatting as Alice");
    return result;
  }

  function dropConnection(server: ReturnType<typeof makeFakeServer>) {
    act(() => server.latest.serverEmit("disconnect", DROP));
  }

  it("keeps the room on screen, pauses sending, then reconnects and rejoins", async () => {
    // A long first delay keeps the disconnected state on screen long enough to inspect it.
    const { server } = await enterRoom(makeFakeServer(), [150]);
    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({ text: "before the drop" }),
      ),
    );

    dropConnection(server);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Connection lost. Reconnecting…",
    );
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("before the drop")).toBeInTheDocument();

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );

    // Same nickname, and the room is rejoined automatically.
    expect(server.createSocket).toHaveBeenLastCalledWith("Alice");
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
    ]);
    expect(screen.getByLabelText("Message")).toBeEnabled();
    expect(screen.getByText("before the drop")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "In this room (1)" }),
    ).toBeInTheDocument();
  });

  it("keeps recognising the guest's own earlier messages under the new guest id", async () => {
    const { server } = await enterRoom();
    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({
          guestId: "guest-me",
          nickname: "Alice",
          text: "my old message",
        }),
      ),
    );
    const author = () => within(screen.getByRole("log")).getByText("Alice");
    expect(author()).toHaveClass("text-indigo-300");

    dropConnection(server);
    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );

    expect(server.latest.guestId).toBe("guest-me-2");
    expect(author()).toHaveClass("text-indigo-300");
  });

  it("fills in the messages missed while disconnected, without repeating the ones already shown", async () => {
    const { server } = await enterRoom();
    const seen = message({ text: "already seen", sentAt: at(1) });
    const missed = message({ text: "sent while away", sentAt: at(2) });
    act(() => server.latest.serverEmit("message:new", seen));

    // The server's history on the rejoin holds both: the one shown before the drop and the one sent during it.
    server.acks["room:join"] = () => ({ ok: true, history: [seen, missed] });
    dropConnection(server);
    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );

    const texts = within(screen.getByRole("log"))
      .getAllByText(/already seen|sent while away/)
      .map((node) => node.textContent);
    expect(texts).toEqual(["already seen", "sent while away"]);
  });

  it("can send again after reconnecting", async () => {
    const { user, server } = await enterRoom();

    dropConnection(server);
    await waitFor(() => expect(screen.getByLabelText("Message")).toBeEnabled());
    await user.type(screen.getByLabelText("Message"), "back again");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: "back again" },
      ]),
    );
  });

  it("keeps trying through temporary failures", async () => {
    const { server } = await enterRoom();
    server.failNextConnections("connection", "unavailable");

    dropConnection(server);

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("keeps trying when the old connection still counts against the network's limit", async () => {
    const { server } = await enterRoom();
    // The server may not have noticed the dropped connection yet, so it still holds a slot.
    server.failNextConnections("too_many_connections");

    dropConnection(server);

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("gives up after the last attempt and returns to the lobby", async () => {
    const { server } = await enterRoom();
    server.failNextConnections("connection", "connection", "connection");

    dropConnection(server);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The connection was lost and could not be restored.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    // The original connection plus exactly three attempts.
    expect(server.createSocket).toHaveBeenCalledTimes(4);
  });

  it("stops immediately when the guest has been banned", async () => {
    const { server } = await enterRoom();
    server.failNextConnections("banned");

    dropConnection(server);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are banned from this chat.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(server.createSocket).toHaveBeenCalledTimes(2);
  });

  it("returns to the lobby with an explanation when the room is full on rejoin", async () => {
    const server = makeFakeServer();
    let joins = 0;
    server.acks["room:join"] = () =>
      joins++ === 0 ? { ok: true } : { ok: false, error: "room_full" };
    await enterRoom(server);

    dropConnection(server);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This room is full.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    // The connection itself was restored, so another room can be joined without a new nickname.
    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
  });

  it("lets the guest leave while reconnecting and stops trying", async () => {
    const server = makeFakeServer();
    const { user } = await enterRoom(server, [150, 150]);

    dropConnection(server);
    await user.click(screen.getByRole("button", { name: "Leave room" }));

    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.createSocket).toHaveBeenCalledTimes(1);
  });

  it("stops trying when the app unmounts", async () => {
    const server = makeFakeServer();
    const { unmount } = await enterRoom(server, [100, 100]);

    dropConnection(server);
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(server.createSocket).toHaveBeenCalledTimes(1);
  });

  it("does not try to reconnect a guest who was only in the lobby", async () => {
    const { user, server } = await enterRoom();
    await user.click(screen.getByRole("button", { name: "Leave room" }));
    await screen.findByRole("heading", { name: "Public rooms" });

    dropConnection(server);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server.createSocket).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
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

      await screen.findByText("Chatting as Ada Mod");
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
      await screen.findByText("Chatting as Ada Mod");

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
      await screen.findByText("Chatting as Ada Mod");

      act(() => server.latest.serverEmit("disconnect", "transport close"));

      await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
      expect(server.createSocket).toHaveBeenLastCalledWith(
        "Ada Mod",
        "signed-token",
      );
    });

    it("sends the guest back to the lobby, saying the session ended, when the token has expired", async () => {
      stubBackend(accepted);
      const server = makeFakeServer();
      const { user } = setup(server, [0]);
      await signIn(user);
      await screen.findByText("Chatting as Ada Mod");
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
      await screen.findByText("Chatting as Ada Mod");

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
      await screen.findByText("Chatting as Alice");
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
            { guestId: "guest-mod", nickname: "Ada Mod", role: "moderator" },
          ],
        }),
      );

      const members = within(screen.getByRole("complementary"));
      expect(members.getByText("Ada Mod")).toHaveClass("text-green-400");
      expect(members.getByText("Alice")).not.toHaveClass("text-green-400");
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
    await screen.findByText("Chatting as Alice");
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
    await screen.findByText("Chatting as Ada Mod");
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
      await screen.findByText("Chatting as Alice");
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
      await screen.findByText("Chatting as Alice");
      act(() => server.latest.serverEmit("announcement:new", announcement()));
      await user.click(screen.getByRole("button", { name: "Dismiss" }));

      act(() => server.latest.serverEmit("disconnect", "transport close"));
      await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
      await screen.findByText("Chatting as Alice");
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

describe("language", () => {
  it("switches the interface language and remembers the choice", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { name: "Public rooms" });

    await user.selectOptions(screen.getByLabelText("Language"), "da");

    expect(
      await screen.findByRole("heading", { name: "Offentlige rum" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("chatter.language")).toBe("da");
    expect(document.documentElement.lang).toBe("da");
  });
});
