import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { DEFAULT_RECONNECT_DELAYS_MS } from "./chat/useChat";
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

  it("shows everyone in the room, the guest included and marked", async () => {
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
    const people = within(
      screen.getByRole("list", { name: "People in this room" }),
    );
    expect(people.getByText("Bob")).toBeInTheDocument();
    expect(people.getByText("Alice")).toBeInTheDocument();
    expect(people.getByText("(you)")).toBeInTheDocument();
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

    // Same nickname and the same identity (the server accepts the secret), and the room is rejoined automatically.
    expect(server.createSocket).toHaveBeenLastCalledWith(
      "Alice",
      undefined,
      undefined,
      { guestId: "guest-me", secret: "secret-1" },
    );
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
    ]);
    expect(screen.getByLabelText("Message")).toBeEnabled();
    expect(screen.getByText("before the drop")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "In this room (1)" }),
    ).toBeInTheDocument();
  });

  it("keeps recognising the guest's own earlier messages when the server gives a new guest id", async () => {
    const { server } = await enterRoom(makeFakeServer({ refuseResume: true }));
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
        undefined,
        { guestId: "guest-me", secret: "secret-1" },
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

describe("direct messages", () => {
  const ME = "guest-me";
  const bob = {
    guestId: "guest-bob",
    nickname: "Bob",
    role: "guest",
    avatar: "male",
  };
  const carol = {
    guestId: "guest-carol",
    nickname: "Carol",
    role: "guest",
    avatar: "female",
  };
  const ada = {
    guestId: "guest-mod",
    nickname: "Ada Mod",
    role: "moderator",
    avatar: "other",
  };

  const dm = (overrides: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    fromGuestId: bob.guestId,
    fromNickname: "Bob",
    fromRole: "guest",
    fromAvatar: "male",
    toGuestId: ME,
    toNickname: "Alice",
    toAvatar: "other",
    text: "hi Alice",
    sentAt: new Date().toISOString(),
    ...overrides,
  });

  const fromMe = (to: typeof bob, text = "hi back") =>
    dm({
      fromGuestId: ME,
      fromNickname: "Alice",
      fromRole: "guest",
      fromAvatar: "other",
      toGuestId: to.guestId,
      toNickname: to.nickname,
      toAvatar: to.avatar,
      text,
    });

  type Server = ReturnType<typeof makeFakeServer>;

  function present(server: Server, others: (typeof bob)[]) {
    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [{ guestId: ME, nickname: "Alice", role: "guest" }, ...others],
      }),
    );
  }

  async function enter(others = [bob, carol, ada]) {
    const result = setup();
    await joinRoom(result.user);
    await screen.findByText("Chatting as Alice");
    present(result.server, others);
    return result;
  }

  const people = () =>
    within(screen.getByRole("list", { name: "People in this room" }));
  const threads = () =>
    within(screen.getByRole("list", { name: "Direct messages" }));
  const receive = (server: Server, message: unknown) =>
    act(() => server.latest.serverEmit("dm:new", message));
  const pane = (name: string) =>
    screen.queryByRole("heading", { name: `Direct message with ${name}` });
  const log = (name: string) =>
    within(screen.getByRole("log", { name: `Direct message with ${name}` }));

  describe("in the room's own chat", () => {
    const roomLog = () => within(screen.getByRole("log"));

    it("shows a received message marked as direct, without opening the conversation", async () => {
      const { server } = await enter();

      receive(server, dm({ text: "psst" }));

      expect(
        roomLog().getByText("Direct message from Bob"),
      ).toBeInTheDocument();
      expect(roomLog().getByText("psst")).toBeInTheDocument();
      expect(pane("Bob")).toBeNull();
    });

    it("shows what the guest wrote to somebody, marked as to them", async () => {
      const { server } = await enter();

      receive(server, fromMe(carol, "hello Carol"));

      expect(
        roomLog().getByText("Direct message to Carol"),
      ).toBeInTheDocument();
      expect(roomLog().getByText("hello Carol")).toBeInTheDocument();
    });

    it("keeps the guest in the room and writes privately from the room's input when the message is clicked", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "psst" }));

      await user.click(roomLog().getByRole("button", { name: "psst" }));

      expect(pane("Bob")).toBeNull();
      expect(screen.getByRole("combobox", { name: "Send to" })).toHaveValue(
        "guest-bob",
      );

      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "hey",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:send")).toEqual([
          { toGuestId: "guest-bob", text: "hey" },
        ]),
      );
      expect(server.latest.emittedEvents("message:send")).toEqual([]);
    });

    it("sends to everybody by default, and to one person when chosen from the dropdown", async () => {
      const { user, server } = await enter();
      const select = screen.getByRole("combobox", { name: "Send to" });

      expect(select).toHaveValue("");
      expect(
        within(select)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["All", "Bob", "Carol", "Ada Mod"]);

      await user.selectOptions(select, "Carol");
      await user.type(
        screen.getByRole("textbox", { name: "Message to Carol" }),
        "psst",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:send")).toEqual([
          { toGuestId: "guest-carol", text: "psst" },
        ]),
      );

      await user.selectOptions(select, "All");

      expect(
        screen.getByRole("textbox", { name: "Message" }),
      ).toBeInTheDocument();
    });

    it("changes who the guest writes to when another person's message is clicked", async () => {
      const { user, server } = await enter();
      const select = screen.getByRole("combobox", { name: "Send to" });
      await user.selectOptions(select, "Carol");
      receive(server, dm({ text: "psst" }));

      await user.click(roomLog().getByRole("button", { name: "psst" }));

      expect(select).toHaveValue("guest-bob");
      expect(pane("Bob")).toBeNull();
    });
  });

  describe("the lists", () => {
    it("shows the people in the room as buttons, and no direct messages yet", async () => {
      await enter();

      expect(people().getByRole("button", { name: "Bob" })).toBeInTheDocument();
      expect(
        people().getByRole("button", { name: "Ada Mod" }),
      ).toBeInTheDocument();
      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });

    it("lists the guest too, but there is nobody to write to when they are alone", async () => {
      await enter([]);

      expect(people().getByText("Alice")).toBeInTheDocument();
      expect(people().getByText("(you)")).toBeInTheDocument();
      expect(people().queryByRole("button")).toBeNull();
    });

    it("does not offer to write to oneself", async () => {
      await enter();

      expect(people().getByText("Alice")).toBeInTheDocument();
      expect(people().queryByRole("button", { name: /Alice/ })).toBeNull();
      expect(people().getAllByRole("button")).toHaveLength(3);
    });

    it("adds a conversation when somebody writes to the guest", async () => {
      const { server } = await enter();

      receive(server, dm());

      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("No direct messages yet."),
      ).not.toBeInTheDocument();
    });

    it("adds a conversation when the guest writes to somebody", async () => {
      const { server } = await enter();

      receive(server, fromMe(carol));

      expect(
        threads().getByRole("button", { name: /Carol/ }),
      ).toBeInTheDocument();
    });

    it("keeps the people list as it was", async () => {
      const { server } = await enter();

      receive(server, dm());

      expect(people().getByRole("button", { name: "Bob" })).toBeInTheDocument();
    });

    it("does not add a conversation just because somebody was opened", async () => {
      const { user } = await enter();

      await user.click(people().getByRole("button", { name: "Bob" }));

      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });

    it("puts the conversation with the latest activity first", async () => {
      const { server } = await enter();
      receive(server, dm());
      receive(
        server,
        dm({
          fromGuestId: carol.guestId,
          fromNickname: "Carol",
          text: "hello",
        }),
      );

      const names = threads()
        .getAllByRole("button")
        .map((button) => button.textContent);
      expect(names[0]).toMatch(/Carol/);
      expect(names[1]).toMatch(/Bob/);

      receive(server, dm({ text: "again" }));

      expect(
        threads()
          .getAllByRole("button")
          .map((button) => button.textContent)[0],
      ).toMatch(/Bob/);
    });

    it("shows a moderator in green in both lists", async () => {
      const { server } = await enter();

      receive(
        server,
        dm({
          fromGuestId: ada.guestId,
          fromNickname: "Ada Mod",
          fromRole: "moderator",
        }),
      );

      expect(people().getByText("Ada Mod")).toHaveClass("text-green-400");
      expect(threads().getByText("Ada Mod")).toHaveClass("text-green-400");
    });

    it("ignores a message that is not shaped like one", async () => {
      const { server } = await enter();

      receive(server, { id: "x", text: "no sender" });
      receive(server, dm({ text: 42 }));

      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });
  });

  describe("new activity", () => {
    it("makes a conversation stand out, with a count, until it is opened", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      receive(server, dm({ text: "are you there?" }));

      const button = threads().getByRole("button", { name: /Bob/ });
      expect(button).toHaveAccessibleName(/Bob.*2 unread messages/);
      expect(button).toHaveClass("motion-safe:animate-pulse");

      await user.click(button);
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      const read = threads().getByRole("button", { name: /Bob/ });
      expect(read).not.toHaveAccessibleName(/unread/);
      expect(read).not.toHaveClass("motion-safe:animate-pulse");
    });

    it("says one unread message in the singular", async () => {
      const { server } = await enter();

      receive(server, dm());

      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).toHaveAccessibleName(/1 unread message$/);
    });

    it("is not triggered by what the guest wrote themselves", async () => {
      const { server } = await enter();

      receive(server, fromMe(bob));

      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
    });

    it("is not triggered while that conversation is open", async () => {
      const { user, server } = await enter();
      await user.click(people().getByRole("button", { name: "Bob" }));

      receive(server, dm({ text: "right here" }));

      expect(log("Bob").getByText("right here")).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );
      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
    });

    it("still stands out for another conversation while one is open", async () => {
      const { user, server } = await enter();
      await user.click(people().getByRole("button", { name: "Bob" }));

      receive(
        server,
        dm({
          fromGuestId: carol.guestId,
          fromNickname: "Carol",
          text: "psst",
        }),
      );

      expect(pane("Bob")).toBeInTheDocument();
      expect(
        threads().getByRole("button", { name: /Carol/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("counts a first message from somebody whose name was clicked but never written to", async () => {
      const { user, server } = await enter();
      await user.click(people().getByRole("button", { name: "Bob" }));
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      receive(server, dm());

      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });
  });

  describe("the conversation", () => {
    it("opens from a name in the people list, with what was said in it", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "first" }));
      receive(server, fromMe(bob, "second"));

      await user.click(people().getByRole("button", { name: "Bob" }));

      expect(pane("Bob")).toBeInTheDocument();
      expect(log("Bob").getByText("first")).toBeInTheDocument();
      expect(log("Bob").getByText("second")).toBeInTheDocument();
    });

    it("opens from the list of conversations", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(pane("Bob")).toBeInTheDocument();
    });

    it("takes the place of the room's messages, and the way back is clear", async () => {
      const { user } = await enter();

      await user.click(people().getByRole("button", { name: "Bob" }));

      expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
      expect(screen.queryByRole("log", { name: "General" })).toBeNull();

      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      expect(pane("Bob")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message" }),
      ).toBeInTheDocument();
    });

    it("shows who said what, and renders words as text", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "<img src=x onerror=alert(1)>" }));
      receive(server, fromMe(bob, "my answer"));

      await user.click(people().getByRole("button", { name: "Bob" }));

      expect(log("Bob").getByText("Bob")).toBeInTheDocument();
      expect(log("Bob").getByText("Alice")).toHaveClass("text-indigo-300");
      expect(
        log("Bob").getByText("<img src=x onerror=alert(1)>"),
      ).toBeInTheDocument();
      expect(document.querySelector("img")).toBeNull();
    });

    it("shows a moderator's words in green and bold, with the label", async () => {
      const { user, server } = await enter();
      receive(
        server,
        dm({
          fromGuestId: ada.guestId,
          fromNickname: "Ada Mod",
          fromRole: "moderator",
          text: "please keep it friendly",
        }),
      );

      await user.click(people().getByRole("button", { name: "Ada Mod" }));

      expect(log("Ada Mod").getByText("please keep it friendly")).toHaveClass(
        "font-bold",
        "text-green-300",
      );
      expect(log("Ada Mod").getByText("Moderator")).toBeInTheDocument();
    });

    it("sends what was written to that person and clears the box", async () => {
      const { user, server } = await enter();
      await user.click(people().getByRole("button", { name: "Bob" }));

      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "  hello Bob  ",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:send")).toEqual([
          { toGuestId: "guest-bob", text: "hello Bob" },
        ]),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("textbox", { name: "Message to Bob" }),
        ).toHaveValue(""),
      );
    });

    it("sends nothing when the box is empty", async () => {
      const { user, server } = await enter();
      await user.click(people().getByRole("button", { name: "Bob" }));

      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "   ",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(server.latest.emittedEvents("dm:send")).toEqual([]);
    });

    it("shows the message once the server has delivered it, not before", async () => {
      const { user, server } = await enter();
      await user.click(people().getByRole("button", { name: "Bob" }));
      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "hello",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:send")).toHaveLength(1),
      );

      expect(log("Bob").queryByText("hello")).not.toBeInTheDocument();

      receive(server, fromMe(bob, "hello"));

      expect(log("Bob").getByText("hello")).toBeInTheDocument();
    });

    it("never shows the same message twice", async () => {
      const { user, server } = await enter();
      const message = dm({ text: "once" });
      receive(server, message);
      receive(server, message);

      await user.click(people().getByRole("button", { name: "Bob" }));

      expect(log("Bob").getAllByText("once")).toHaveLength(1);
    });

    it("explains how long to wait, and keeps the words", async () => {
      const { user, server } = await enter();
      server.latest.acks["dm:send"] = () => ({
        ok: false,
        error: "rate_limited",
        retryAfterMs: 2_100,
      });
      await user.click(people().getByRole("button", { name: "Bob" }));

      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "again",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You can send again in 3 s.",
      );
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toHaveValue("again");
    });

    it("explains when the person has gone", async () => {
      const { user, server } = await enter();
      server.latest.acks["dm:send"] = () => ({
        ok: false,
        error: "user_not_found",
      });
      await user.click(people().getByRole("button", { name: "Bob" }));

      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "hello?",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That person is not in this room any more.",
      );
    });

    it("clears an explanation once the next try works", async () => {
      const { user, server } = await enter();
      const answers = [
        { ok: false, error: "rate_limited", retryAfterMs: 1_000 },
        { ok: true },
      ];
      server.latest.acks["dm:send"] = () => answers.shift();
      await user.click(people().getByRole("button", { name: "Bob" }));
      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "hi",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
      );
    });

    it("does not carry an explanation over to another conversation", async () => {
      const { user, server } = await enter();
      server.latest.acks["dm:send"] = () => ({
        ok: false,
        error: "user_not_found",
      });
      await user.click(people().getByRole("button", { name: "Bob" }));
      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "hello?",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByRole("alert");
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      await user.click(people().getByRole("button", { name: "Carol" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message to Carol" }),
      ).toHaveValue("");
    });
  });

  describe("when the other person is not there", () => {
    it("says so and does not let the guest write, until they are back", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /Bob/ }));
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeEnabled();

      present(server, [carol, ada]);

      expect(screen.getByRole("status")).toHaveTextContent(
        "Bob is not in this room right now.",
      );
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      // What was said stays readable.
      expect(log("Bob").getByText("hi Alice")).toBeInTheDocument();

      present(server, [bob, carol, ada]);

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeEnabled();
    });

    it("replaces the words of somebody who was banned, as in the room", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "something nasty" }));
      receive(server, fromMe(bob, "stop that"));

      act(() =>
        server.latest.serverEmit("message:redacted", {
          roomSlug: "general",
          ids: [],
          guestIds: [bob.guestId],
        }),
      );
      present(server, [carol, ada]);
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(log("Bob").queryByText("something nasty")).not.toBeInTheDocument();
      expect(log("Bob").getByText("This user was banned")).toBeInTheDocument();
      // What the guest wrote is theirs to keep.
      expect(log("Bob").getByText("stop that")).toBeInTheDocument();
    });
  });

  describe("blocking", () => {
    it("blocks the person, says so, and can undo it", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      await user.click(screen.getByRole("button", { name: "Block Bob" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:block")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
      expect(
        await screen.findByRole("button", { name: "Unblock Bob" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "You blocked Bob. Their messages no longer reach you.",
        ),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Unblock Bob" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:unblock")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
      expect(
        await screen.findByRole("button", { name: "Block Bob" }),
      ).toBeInTheDocument();
    });

    it("does not show it as blocked when the server refuses", async () => {
      const { user, server } = await enter();
      server.latest.acks["dm:block"] = () => ({
        ok: false,
        error: "too_many_blocked",
      });
      await user.click(people().getByRole("button", { name: "Bob" }));

      await user.click(screen.getByRole("button", { name: "Block Bob" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You have blocked as many people as you can.",
      );
      expect(
        screen.getByRole("button", { name: "Block Bob" }),
      ).toBeInTheDocument();
    });

    it("remembers a block when the conversation is closed and opened again", async () => {
      const { user } = await enter();
      await user.click(people().getByRole("button", { name: "Bob" }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findByRole("button", { name: "Unblock Bob" });
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      await user.click(people().getByRole("button", { name: "Bob" }));

      expect(
        screen.getByRole("button", { name: "Unblock Bob" }),
      ).toBeInTheDocument();
    });

    it("tells a new connection who was blocked, since the server forgets", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [0]);
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");
      present(server, [bob]);
      await user.click(people().getByRole("button", { name: "Bob" }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findByRole("button", { name: "Unblock Bob" });

      act(() => server.latest.serverEmit("disconnect", "transport close"));
      await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:block")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
    });

    it("does not offer to block a moderator", async () => {
      const { user } = await enter();

      await user.click(people().getByRole("button", { name: "Ada Mod" }));

      expect(pane("Ada Mod")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Block/ })).toBeNull();
    });
  });

  describe("status messages", () => {
    const statuses = () =>
      log("Bob")
        .getAllByRole("listitem")
        .filter((item) => item.getAttribute("data-kind") === "status");

    it("says in the conversation, with the time, when the other person leaves the room", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      present(server, [carol, ada]);

      const [status] = statuses();
      expect(within(status).getByText("Bob left the room.")).toHaveClass(
        "text-sky-300",
      );
      expect(status.querySelector("time")).toHaveAttribute("datetime");
    });

    it("says so again, as a new message, when they come back", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /Bob/ }));
      present(server, [carol, ada]);

      present(server, [bob, carol, ada]);

      expect(statuses().map((item) => item.textContent)).toEqual([
        expect.stringContaining("Bob left the room."),
        expect.stringContaining("Bob rejoined the room."),
      ]);
    });

    it("keeps the order of what was said and what happened", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "before" }));
      await user.click(threads().getByRole("button", { name: /Bob/ }));
      present(server, [carol, ada]);
      present(server, [bob, carol, ada]);
      receive(server, dm({ text: "after" }));

      const lines = log("Bob")
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");

      expect(lines[0]).toContain("before");
      expect(lines[1]).toContain("left the room");
      expect(lines[2]).toContain("rejoined the room");
      expect(lines[3]).toContain("after");
    });

    it("does not repeat itself when the list of people changes for somebody else", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      present(server, [carol, ada]);
      present(server, [carol]);
      present(server, [carol, ada]);

      expect(statuses()).toHaveLength(1);
    });

    it("says nothing about people nobody has written to", async () => {
      const { server } = await enter();
      receive(server, dm());

      present(server, [bob]);
      present(server, []);

      expect(
        threads().queryByRole("button", { name: /Carol/ }),
      ).not.toBeInTheDocument();
    });

    it("is not new activity: the conversation does not pulse for it", async () => {
      const { server } = await enter();
      receive(server, fromMe(bob));

      present(server, [carol, ada]);

      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
    });

    it("is not added just because the guest left the room and came back to it", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join General" }));
      await screen.findByText("Chatting as Alice");
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(statuses()).toHaveLength(0);
    });

    it("is not added just because the guest moved to another room", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join Music" }));
      await screen.findByText("Chatting as Alice");
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(statuses()).toHaveLength(0);
    });
  });

  describe("how it looks", () => {
    it("puts what others say on the left, with their avatar, and what the guest says on the right without one", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "from Bob" }));
      receive(server, fromMe(bob, "from me"));

      await user.click(people().getByRole("button", { name: "Bob" }));

      const theirs = log("Bob").getByText("from Bob").closest("li");
      const mine = log("Bob").getByText("from me").closest("li");
      expect(theirs).toHaveAttribute("data-side", "left");
      expect(within(theirs!).getByTitle("Male")).toBeInTheDocument();
      expect(mine).toHaveAttribute("data-side", "right");
      expect(within(mine!).queryByTitle("Other")).not.toBeInTheDocument();
    });

    it("shows the other person's avatar in both lists", async () => {
      const { server } = await enter();
      receive(server, dm());

      expect(people().getByTitle("Female")).toBeInTheDocument();
      expect(threads().getByTitle("Male")).toBeInTheDocument();
    });
  });

  describe("through a reload", () => {
    const DIRECT = "chatter.direct";
    type Entered = Awaited<ReturnType<typeof enter>>;

    async function reload(before: Entered) {
      before.unmount();
      const result = setup();
      await screen.findByText("Chatting as Alice");
      present(result.server, [bob, carol, ada]);
      return result;
    }

    it("keeps the conversations, and what was said in them", async () => {
      const first = await enter();
      receive(first.server, dm({ text: "before the reload" }));
      receive(first.server, fromMe(bob, "my answer"));

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(log("Bob").getByText("before the reload")).toBeInTheDocument();
      expect(log("Bob").getByText("my answer")).toBeInTheDocument();
    });

    it("shows my own words on my side, as before", async () => {
      const first = await enter();
      receive(first.server, fromMe(bob, "my answer"));

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(log("Bob").getByText("my answer").closest("li")).toHaveAttribute(
        "data-side",
        "right",
      );
    });

    it("keeps which conversations had something new", async () => {
      const first = await enter();
      receive(first.server, dm());

      await reload(first);

      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("keeps who was blocked, and tells the new connection", async () => {
      const first = await enter();
      await first.user.click(people().getByRole("button", { name: "Bob" }));
      await first.user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findByRole("button", { name: "Unblock Bob" });

      const { server } = await reload(first);

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:block")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
    });

    it("does not say the other person left just because the page was reloaded", async () => {
      const first = await enter();
      receive(first.server, dm());

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(
        log("Bob").queryByText("Bob left the room."),
      ).not.toBeInTheDocument();
    });

    describe("the conversation that was open", () => {
      const SAVED_DIRECT = "chatter.direct";

      // The real server lists everybody in the room when it is joined, so the other person is there from the start.
      async function reloadWith(before: Entered, others: unknown[]) {
        before.unmount();
        const result = setup(makeFakeServer({ others }));
        await screen.findByText("Chatting as Alice");
        return result;
      }

      async function openBob() {
        const first = await enter();
        receive(first.server, dm({ text: "before the reload" }));
        await first.user.click(threads().getByRole("button", { name: /Bob/ }));
        return first;
      }

      it("is open again when the other person is still in the room", async () => {
        const first = await openBob();

        await reloadWith(first, [bob, carol]);

        expect(pane("Bob")).toBeInTheDocument();
        expect(log("Bob").getByText("before the reload")).toBeInTheDocument();
      });

      it("is closed when the other person has left, and the room is shown instead", async () => {
        const first = await openBob();

        await reloadWith(first, [carol]);

        expect(pane("Bob")).not.toBeInTheDocument();
        expect(
          screen.getByRole("log", { name: "General" }),
        ).toBeInTheDocument();
      });

      it("is still in the list when it was closed because the other person is gone", async () => {
        const first = await openBob();

        await reloadWith(first, [carol]);

        expect(
          threads().getByRole("button", { name: /Bob/ }),
        ).toBeInTheDocument();
      });

      it("is not opened when none was open", async () => {
        const first = await enter();
        receive(first.server, dm());

        await reloadWith(first, [bob]);

        expect(pane("Bob")).not.toBeInTheDocument();
      });

      it("is not opened again after it was closed", async () => {
        const first = await openBob();
        await first.user.click(
          screen.getByRole("button", { name: "Back to the room" }),
        );

        await reloadWith(first, [bob]);

        expect(pane("Bob")).not.toBeInTheDocument();
      });

      it("is not opened for somebody the guest has no conversation with", async () => {
        const first = await openBob();
        const saved = JSON.parse(sessionStorage.getItem(SAVED_DIRECT)!);
        saved.openGuestId = "guest-stranger";
        sessionStorage.setItem(SAVED_DIRECT, JSON.stringify(saved));

        await reloadWith(first, [bob]);

        expect(
          screen.queryByRole("heading", { name: /^Direct message with/ }),
        ).toBeNull();
      });

      it("is not kept when the room is gone", async () => {
        const first = await openBob();
        first.unmount();
        const server = makeFakeServer({ others: [bob] });
        server.acks["room:join"] = () => ({
          ok: false,
          error: "room_not_found",
        });
        const { user } = setup(server);

        await screen.findByRole("heading", { name: "Public rooms" });
        await waitFor(() => expect(server.sockets).toHaveLength(1));
        server.latest.acks["room:join"] = () => ({ ok: true });
        await user.click(screen.getByRole("button", { name: "Join Music" }));
        await screen.findByText("Chatting as Alice");

        expect(
          screen.queryByRole("heading", { name: /^Direct message with/ }),
        ).toBeNull();
      });

      it("is kept for the next reload, whoever is there", async () => {
        const first = await openBob();
        const second = await reloadWith(first, [bob]);

        await reloadWith(second, [bob]);

        expect(pane("Bob")).toBeInTheDocument();
      });
    });

    // Bob was told Alice left and came back, so Alice's own copy of the conversation says the same.
    it("says the guest left and came back, the same as the other person was told", async () => {
      const first = await enter();
      receive(first.server, dm({ text: "before" }));

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      const lines = log("Bob")
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");
      expect(lines[0]).toContain("before");
      expect(lines.filter((line) => line.includes("Alice"))).toEqual([
        expect.stringContaining("Alice left the room."),
        expect.stringContaining("Alice rejoined the room."),
      ]);
    });

    it("says it in every conversation", async () => {
      const first = await enter();
      receive(first.server, dm({ text: "from Bob" }));
      receive(
        first.server,
        dm({
          text: "from Carol",
          fromGuestId: carol.guestId,
          fromNickname: "Carol",
          fromAvatar: carol.avatar,
        }),
      );

      const { user } = await reload(first);

      for (const name of ["Bob", "Carol"]) {
        await user.click(
          threads().getByRole("button", { name: new RegExp(name) }),
        );
        expect(
          log(name).getByText("Alice rejoined the room."),
        ).toBeInTheDocument();
        await user.click(
          screen.getByRole("button", { name: "Back to the room" }),
        );
      }
    });

    it("keeps saying it after another reload", async () => {
      const first = await enter();
      receive(first.server, dm());

      const second = await reload(first);
      await waitFor(() =>
        expect(sessionStorage.getItem(DIRECT)).toContain("rejoined"),
      );
      const { user } = await reload(second);
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(log("Bob").getAllByText("Alice rejoined the room.")).toHaveLength(
        2,
      );
    });

    it("says nothing when the server did not give the same guest back", async () => {
      const first = await enter();
      receive(first.server, dm());
      first.unmount();
      // The identity the server is asked for is one it does not know.
      const saved = JSON.parse(sessionStorage.getItem("chatter.session")!);
      saved.resume.guestId = "guest-old";
      sessionStorage.setItem("chatter.session", JSON.stringify(saved));

      const { user } = setup(makeFakeServer({ refuseResume: true }));
      await screen.findByText("Chatting as Alice");
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(
        log("Bob").queryByText("Alice rejoined the room."),
      ).not.toBeInTheDocument();
    });

    it("forgets them when the connection ends for good", async () => {
      const first = await enter();
      receive(first.server, dm());
      await waitFor(() =>
        expect(sessionStorage.getItem(DIRECT)).not.toBeNull(),
      );

      act(() => {
        first.server.latest.serverEmit("kicked", { reason: "banned" });
        first.server.latest.serverEmit("disconnect", "io server disconnect");
      });

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(sessionStorage.getItem(DIRECT)).toBeNull();
    });

    it("copes with saved conversations that are not what it expects", async () => {
      sessionStorage.setItem(
        "chatter.session",
        JSON.stringify({ nickname: "Alice" }),
      );
      sessionStorage.setItem(DIRECT, "{not json");
      window.history.replaceState(null, "", "/rooms/general");

      setup();

      await screen.findByText("Chatting as Alice");
      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });

    it("drops the broken ones and keeps the good", async () => {
      const good = {
        guestId: "guest-bob",
        nickname: "Bob",
        role: "guest",
        avatar: "male",
        unread: 0,
        present: true,
        entries: [
          { ...dm({ text: "still here" }), id: "ok-1" },
          { id: 5, text: "broken" },
        ],
      };
      sessionStorage.setItem(
        "chatter.session",
        JSON.stringify({ nickname: "Alice" }),
      );
      sessionStorage.setItem(
        DIRECT,
        JSON.stringify({
          threads: [good, { nickname: "No id" }, "nonsense", null],
          blockedIds: ["guest-x", 3],
        }),
      );
      window.history.replaceState(null, "", "/rooms/general");

      const { user } = setup();
      await screen.findByText("Chatting as Alice");
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      expect(log("Bob").getByText("still here")).toBeInTheDocument();
      expect(log("Bob").queryByText("broken")).not.toBeInTheDocument();
      expect(threads().getAllByRole("button")).toHaveLength(1);
    });
  });

  describe("moving around", () => {
    it("keeps the conversations when the guest goes to another room", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join Music" }));
      await screen.findByText("Chatting as Alice");

      expect(
        threads().getByRole("button", { name: /Bob/ }),
      ).toBeInTheDocument();
    });

    it("closes an open conversation when the guest leaves the room", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /Bob/ }));

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join Music" }));
      await screen.findByText("Chatting as Alice");

      expect(pane("Bob")).not.toBeInTheDocument();
    });

    it("forgets them all when the connection is given up", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [150, 150]);
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");
      present(server, [bob]);
      receive(server, dm());

      act(() => server.latest.serverEmit("disconnect", "transport close"));
      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });
  });
});

describe("who comes and goes", () => {
  const ME = { guestId: "guest-me", nickname: "Alice" };
  const BOB = { guestId: "guest-bob", nickname: "Bob" };
  const CAROL = { guestId: "guest-carol", nickname: "Carol" };
  const KEY = "chatter.showMovements";

  const roomLog = () => within(screen.getByRole("log", { name: "General" }));
  const checkbox = () =>
    screen.getByRole("checkbox", { name: "Show when people join and leave" });
  const present = (
    server: ReturnType<typeof makeFakeServer>,
    members: { guestId: string; nickname: string }[],
    roomSlug = "general",
  ) =>
    act(() => server.latest.serverEmit("room:presence", { roomSlug, members }));
  const said = (server: ReturnType<typeof makeFakeServer>, text: string) =>
    act(() => server.latest.serverEmit("message:new", message({ text })));

  async function enter(members = [ME, BOB]) {
    const result = setup(
      makeFakeServer({
        others: members.filter((member) => member.guestId !== ME.guestId),
      }),
    );
    await joinRoom(result.user);
    await screen.findByText("Chatting as Alice");
    return result;
  }

  const lines = () =>
    roomLog()
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");

  it("says, with the time, when somebody comes into the room", async () => {
    const { server } = await enter();

    present(server, [ME, BOB, CAROL]);

    const item = roomLog().getByText("Carol joined the room.").closest("li")!;
    expect(item).toHaveAttribute("data-kind", "status");
    expect(item.querySelector("time")).toHaveAttribute("datetime");
  });

  it("says when somebody goes out of it", async () => {
    const { server } = await enter();

    present(server, [ME]);

    expect(roomLog().getByText("Bob left the room.")).toBeInTheDocument();
  });

  it("says nothing about the people who were already there, or about the guest", async () => {
    await enter([ME, BOB, CAROL]);

    expect(roomLog().queryByText(/joined the room|left the room/)).toBeNull();
  });

  it("says nothing when the list is for another room", async () => {
    const { server } = await enter();

    present(server, [CAROL], "music");

    expect(roomLog().queryByText(/joined the room|left the room/)).toBeNull();
  });

  it("says nothing when the list did not change", async () => {
    const { server } = await enter();

    present(server, [ME, BOB]);

    expect(roomLog().queryByText(/joined the room|left the room/)).toBeNull();
  });

  it("says who left and who came when both happen at once", async () => {
    const { server } = await enter();

    present(server, [ME, CAROL]);

    expect(lines()).toEqual([
      expect.stringContaining("Bob left the room."),
      expect.stringContaining("Carol joined the room."),
    ]);
  });

  it("puts it between the messages, where it happened", async () => {
    const { server } = await enter();

    said(server, "before");
    present(server, [ME, BOB, CAROL]);
    said(server, "after");

    expect(lines()).toEqual([
      expect.stringContaining("before"),
      expect.stringContaining("Carol joined the room."),
      expect.stringContaining("after"),
    ]);
  });

  it("does not count the room as empty when only the movements are there", async () => {
    const { server } = await enter();

    present(server, [ME, BOB, CAROL]);

    expect(screen.queryByText("No messages yet. Say hello!")).toBeNull();
  });

  describe("the checkbox", () => {
    it("is ticked to begin with", async () => {
      await enter();

      expect(checkbox()).toBeChecked();
    });

    it("hides what was announced, and shows it again", async () => {
      const { user, server } = await enter();
      said(server, "hello all");
      present(server, [ME, BOB, CAROL]);

      await user.click(checkbox());

      expect(roomLog().queryByText("Carol joined the room.")).toBeNull();
      expect(roomLog().getByText("hello all")).toBeInTheDocument();

      await user.click(checkbox());

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });

    it("keeps what happened while it was off, for when it is turned on", async () => {
      const { user, server } = await enter();
      await user.click(checkbox());

      present(server, [ME, BOB, CAROL]);
      expect(roomLog().queryByText("Carol joined the room.")).toBeNull();

      await user.click(checkbox());

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });

    it("is remembered by the browser", async () => {
      const { user, unmount } = await enter();
      await user.click(checkbox());
      expect(localStorage.getItem(KEY)).toBe("false");
      unmount();
      // A new tab: the browser's choice stays, what the tab knew does not.
      sessionStorage.clear();
      window.history.replaceState(null, "", "/");

      const next = await enter();

      expect(checkbox()).not.toBeChecked();
      present(next.server, [ME, BOB, CAROL]);
      expect(roomLog().queryByText("Carol joined the room.")).toBeNull();
    });

    it("is remembered when it is ticked again", async () => {
      const { user } = await enter();
      await user.click(checkbox());
      await user.click(checkbox());

      expect(localStorage.getItem(KEY)).toBe("true");
    });

    it("is ticked when the browser holds something else", async () => {
      localStorage.setItem(KEY, "maybe");

      await enter();

      expect(checkbox()).toBeChecked();
    });
  });

  describe("when somebody is banned", () => {
    const banned = (
      server: ReturnType<typeof makeFakeServer>,
      guestId: string,
    ) =>
      act(() =>
        server.latest.serverEmit("message:redacted", {
          roomSlug: "general",
          ids: [],
          guestIds: [guestId],
        }),
      );

    it("takes their name out of what was announced", async () => {
      const { server } = await enter([ME, BOB]);
      present(server, [ME, BOB, CAROL]);

      banned(server, CAROL.guestId);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
    });

    it("leaves what was announced about others", async () => {
      const { server } = await enter([ME, BOB]);
      present(server, [ME, BOB, CAROL]);

      banned(server, CAROL.guestId);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
      present(server, [ME]);
      expect(roomLog().getByText("Bob left the room.")).toBeInTheDocument();
    });

    it("says nothing about them going, which is what happens next", async () => {
      const { server } = await enter([ME, BOB, CAROL]);

      banned(server, CAROL.guestId);
      present(server, [ME, BOB]);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
    });

    it("ignores an empty id in the notice", async () => {
      const { server } = await enter([ME, BOB]);
      present(server, [ME, BOB, CAROL]);

      banned(server, "");

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });
  });

  it("starts afresh in another room", async () => {
    const { user, server } = await enter();
    present(server, [ME, BOB, CAROL]);

    await user.click(screen.getByRole("button", { name: "Leave room" }));
    await screen.findByRole("heading", { name: "Public rooms" });
    await user.click(screen.getByRole("button", { name: "Join Music" }));
    await screen.findByText("Chatting as Alice");

    expect(screen.queryByText("Carol joined the room.")).toBeNull();
  });
});

describe("avatars", () => {
  const SAVED = "chatter.session";

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    return within(await screen.findByRole("group", { name: "Avatar" }));
  }

  async function submitAs(
    user: ReturnType<typeof userEvent.setup>,
    avatar?: string,
  ) {
    const group = await openDialog(user);
    if (avatar) await user.click(group.getByRole("radio", { name: avatar }));
    await user.type(screen.getByLabelText("Nickname"), "Alice");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Chatting as Alice");
  }

  describe("choosing one", () => {
    it("offers four, with the plain one chosen unless the guest says otherwise", async () => {
      const { user } = setup();

      const group = await openDialog(user);

      expect(group.getAllByRole("radio")).toHaveLength(4);
      for (const name of ["Male", "Female", "Trans"]) {
        expect(group.getByRole("radio", { name })).not.toBeChecked();
      }
      expect(group.getByRole("radio", { name: "Other" })).toBeChecked();
    });

    it("joins with the avatar that was chosen", async () => {
      const { user, server } = setup();

      await submitAs(user, "Female");

      expect(server.createSocket).toHaveBeenCalledWith(
        "Alice",
        undefined,
        "female",
      );
    });

    it("sends nothing extra when the guest keeps the plain one", async () => {
      const { user, server } = setup();

      await submitAs(user);

      expect(server.createSocket).toHaveBeenCalledWith("Alice");
    });

    it("is not offered to a moderator, whose name and look come from their account", async () => {
      const { user } = setup();
      await openDialog(user);

      await user.click(
        screen.getByRole("button", { name: "Sign in as moderator" }),
      );

      expect(
        screen.queryByRole("group", { name: "Avatar" }),
      ).not.toBeInTheDocument();
    });

    it("is kept for a reload, along with the nickname", async () => {
      const first = setup();
      await submitAs(first.user, "Trans");
      first.unmount();

      const { server } = setup();

      await screen.findByText("Chatting as Alice");
      expect(server.createSocket).toHaveBeenCalledWith(
        "Alice",
        undefined,
        "trans",
        { guestId: "guest-me", secret: "secret-1" },
      );
    });

    it("is dropped from a saved session when it is not one we know", async () => {
      sessionStorage.setItem(
        SAVED,
        JSON.stringify({ nickname: "Alice", avatar: "robot" }),
      );
      window.history.replaceState(null, "", "/rooms/general");
      const { server } = setup();

      await screen.findByText("Chatting as Alice");

      expect(server.createSocket).toHaveBeenCalledWith("Alice");
    });
  });

  describe("seeing them", () => {
    const log = () => within(screen.getByRole("log"));

    async function enterWith(live: unknown[]) {
      const server = makeFakeServer();
      server.acks["room:join"] = () => {
        live.forEach((m) => server.latest.serverEmit("message:new", m));
        return { ok: true, history: [] };
      };
      const result = setup(server);
      await joinRoom(result.user);
      await screen.findByText("Chatting as Alice");
      return result;
    }

    it.each([
      ["Male", "male", "\u2642"],
      ["Female", "female", "\u2640"],
      ["Trans", "trans", "\u26a7"],
    ])(
      "shows %s with its own symbol next to what somebody says",
      async (title, avatar, symbol) => {
        await enterWith([message({ avatar })]);

        expect(log().getByTitle(title)).toHaveTextContent(symbol);
      },
    );

    it("shows the plain avatar for somebody who did not choose, or whose avatar is not one we know", async () => {
      await enterWith([
        message({ id: "a", text: "one" }),
        message({ id: "b", text: "two", avatar: "robot" }),
      ]);

      expect(log().getAllByTitle("Other")).toHaveLength(2);
    });

    it("does not show an avatar next to the guest's own messages", async () => {
      await enterWith([
        message({
          guestId: "guest-me",
          nickname: "Alice",
          avatar: "male",
          text: "mine",
        }),
      ]);

      expect(log().queryByTitle("Male")).not.toBeInTheDocument();
    });

    it("shows everybody's avatar in the list of people, the guest's own included", async () => {
      const { server } = await enterWith([]);

      act(() =>
        server.latest.serverEmit("room:presence", {
          roomSlug: "general",
          members: [
            { guestId: "guest-me", nickname: "Alice", avatar: "female" },
            { guestId: "guest-bob", nickname: "Bob", avatar: "trans" },
          ],
        }),
      );

      const people = within(
        screen.getByRole("list", { name: "People in this room" }),
      );
      expect(people.getByTitle("Female")).toBeInTheDocument();
      expect(people.getByTitle("Trans")).toBeInTheDocument();
    });
  });

  describe("bubbles in the room", () => {
    const side = (text: string) =>
      screen.getByText(text).closest("li")?.getAttribute("data-side");

    it("puts what others say on the left and what the guest says on the right", async () => {
      const server = makeFakeServer();
      server.acks["room:join"] = () => {
        server.latest.serverEmit("message:new", message({ text: "theirs" }));
        server.latest.serverEmit(
          "message:new",
          message({ guestId: "guest-me", nickname: "Alice", text: "mine" }),
        );
        return { ok: true, history: [] };
      };
      const { user } = setup(server);
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      expect(side("theirs")).toBe("left");
      expect(side("mine")).toBe("right");
    });
  });
});

describe("keeping your place", () => {
  const SAVED = "chatter.session";
  const path = () => window.location.pathname;
  const save = (session: Record<string, unknown>) =>
    sessionStorage.setItem(SAVED, JSON.stringify(session));
  const goTo = (to: string) => window.history.replaceState(null, "", to);

  describe("the address", () => {
    it("shows the room in the address once the guest is in it", async () => {
      const { user } = setup();

      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      expect(path()).toBe("/rooms/general");
    });

    it("goes back to the lobby's address when the guest leaves the room", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(path()).toBe("/");
    });

    it("follows the guest to another room", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");
      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await user.click(
        await screen.findByRole("button", { name: "Join Music" }),
      );

      await waitFor(() => expect(path()).toBe("/rooms/music"));
    });

    it("does not change the address while the guest is only choosing a nickname", async () => {
      const { user } = setup();

      await user.click(
        await screen.findByRole("button", { name: "Join General" }),
      );
      await screen.findByLabelText("Nickname");

      expect(path()).toBe("/");
    });

    it("takes the guest out of the room with the browser's back button, and in again with forward", async () => {
      const { user, server } = setup();
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      act(() => window.history.back());

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(server.latest.emittedEvents("room:leave")).toHaveLength(1);

      act(() => window.history.forward());

      await screen.findByText("Chatting as Alice");
      expect(server.latest.emittedEvents("room:join")).toHaveLength(2);
      expect(path()).toBe("/rooms/general");
    });
  });

  describe("opening a room's address", () => {
    it("asks for a nickname for that room when the guest has none saved", async () => {
      goTo("/rooms/music");
      setup();

      expect(await screen.findByLabelText("Nickname")).toBeInTheDocument();
      expect(path()).toBe("/rooms/music");
    });

    it("joins that room as the nickname used before in this tab", async () => {
      save({ nickname: "Alice" });
      goTo("/rooms/music");
      const { server } = setup();

      await screen.findByText("Chatting as Alice");

      expect(server.createSocket).toHaveBeenCalledWith("Alice");
      expect(server.latest.emittedEvents("room:join")).toEqual([
        { slug: "music" },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("signs a moderator back in with the saved token, without the password", async () => {
      save({ nickname: "Ada Mod", token: "signed-token" });
      goTo("/rooms/general");
      const { server } = setup();

      await screen.findByText("Chatting as Ada Mod");

      expect(server.createSocket).toHaveBeenCalledWith(
        "Ada Mod",
        "signed-token",
      );
    });

    describe("taking over the identity from before the reload", () => {
      const resume = { guestId: "guest-old", secret: "old-secret" };
      const saved = () => JSON.parse(sessionStorage.getItem(SAVED) ?? "null");

      it("presents the saved id and secret, so the server can give the same guest id back", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        const { server } = setup();

        await screen.findByText("Chatting as Alice");

        expect(server.createSocket).toHaveBeenCalledWith(
          "Alice",
          undefined,
          undefined,
          resume,
        );
        expect(server.latest.guestId).toBe("guest-old");
      });

      // Each connection is given a new secret, and only the newest one works.
      it("saves the new secret the server gave the new connection", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        setup();

        await screen.findByText("Chatting as Alice");

        expect(saved().resume).toEqual({
          guestId: "guest-old",
          secret: "secret-1",
        });
      });

      it("does not note the id it already had a second time", async () => {
        save({ nickname: "Alice", guestIds: ["guest-old"], resume });
        goTo("/rooms/general");
        setup();

        await screen.findByText("Chatting as Alice");

        expect(saved().guestIds).toEqual(["guest-old"]);
      });

      it("does not present a secret again once the server has stopped giving them", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        const server = makeFakeServer({ withoutSecret: true });
        setup(server, [5]);
        await screen.findByText("Chatting as Alice");

        act(() => server.latest.serverEmit("disconnect", "transport close"));
        await waitFor(() =>
          expect(server.createSocket).toHaveBeenCalledTimes(2),
        );

        expect(server.createSocket).toHaveBeenLastCalledWith("Alice");
      });

      it("saves the new identity when the server did not accept the old one", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        setup(makeFakeServer({ refuseResume: true }));

        await screen.findByText("Chatting as Alice");

        expect(saved().resume).toEqual({
          guestId: "guest-me",
          secret: "secret-1",
        });
        expect(saved().guestIds).toEqual(["guest-me"]);
      });

      it("also works for a moderator", async () => {
        save({ nickname: "Ada Mod", token: "signed-token", resume });
        goTo("/rooms/general");
        const { server } = setup();

        await screen.findByText("Chatting as Ada Mod");

        expect(server.createSocket).toHaveBeenCalledWith(
          "Ada Mod",
          "signed-token",
          undefined,
          resume,
        );
      });

      it.each([
        ["without a secret", { guestId: "guest-old" }],
        ["without an id", { secret: "old-secret" }],
        ["with numbers", { guestId: 1, secret: 2 }],
        ["empty", { guestId: "", secret: "" }],
      ])("does not present what was saved %s", async (_label, broken) => {
        save({ nickname: "Alice", resume: broken });
        goTo("/rooms/general");
        const { server } = setup();

        await screen.findByText("Chatting as Alice");

        expect(server.createSocket).toHaveBeenCalledWith("Alice");
      });

      it("does not carry it into a guest who signs in afresh", async () => {
        save({ nickname: "Alice", resume });
        const { user, server } = setup();

        await joinRoom(user, "General", "Bob");
        await screen.findByText("Chatting as Bob");

        expect(server.createSocket).toHaveBeenCalledWith("Bob");
      });

      it("is forgotten with everything else when the connection ends for good", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        const server = makeFakeServer();
        const { user } = setup(server, [150]);
        await screen.findByText("Chatting as Alice");

        act(() => server.latest.serverEmit("disconnect", "transport close"));
        await user.click(screen.getByRole("button", { name: "Leave room" }));
        await screen.findByRole("heading", { name: "Public rooms" });

        expect(sessionStorage.getItem(SAVED)).toBeNull();
      });
    });

    describe("after a reload", () => {
      const side = (text: string) =>
        screen.getByText(text).closest("li")?.getAttribute("data-side");
      const savedIds = () =>
        JSON.parse(sessionStorage.getItem(SAVED) ?? "null")?.guestIds;

      async function reloadWith(
        history: unknown[],
        saved: unknown = ["guest-before"],
      ) {
        save({ nickname: "Alice", guestIds: saved });
        goTo("/rooms/general");
        const server = makeFakeServer();
        server.acks["room:join"] = () => ({ ok: true, history });
        setup(server);
        await screen.findByText("Chatting as Alice");
      }

      // The server gives a guest a new id on every connection, so a reload is a new connection.
      it("still shows what the guest wrote before as theirs, on their side", async () => {
        await reloadWith([
          message({
            id: "old",
            guestId: "guest-before",
            nickname: "Alice",
            text: "from before",
            sentAt: at(1),
          }),
          message({ id: "other", text: "from Bob", sentAt: at(2) }),
        ]);

        expect(side("from before")).toBe("right");
        expect(side("from Bob")).toBe("left");
      });

      it("remembers the id of each connection for the next reload", async () => {
        const { user } = setup();

        await joinRoom(user);
        await screen.findByText("Chatting as Alice");

        expect(savedIds()).toEqual(["guest-me"]);
      });

      it("keeps the earlier ids too", async () => {
        await reloadWith([]);

        expect(savedIds()).toEqual(["guest-before", "guest-me"]);
      });

      it("keeps only the latest ids, so the saved list cannot grow without end", async () => {
        await reloadWith(
          [],
          Array.from({ length: 30 }, (_, n) => `guest-${n}`),
        );

        expect(savedIds()).toHaveLength(20);
        expect(savedIds().at(-1)).toBe("guest-me");
        expect(savedIds()[0]).toBe("guest-11");
      });

      it("ignores saved ids that are not text", async () => {
        await reloadWith([], [1, null, "guest-ok", { id: 2 }]);

        expect(savedIds()).toEqual(["guest-ok", "guest-me"]);
      });

      it("does not take what somebody else wrote for the guest's own", async () => {
        await reloadWith([
          message({ id: "x", guestId: "guest-stranger", text: "not mine" }),
        ]);

        expect(side("not mine")).toBe("left");
      });
    });

    it("carries on after a reload, as if nothing happened", async () => {
      const first = setup();
      await joinRoom(first.user);
      await screen.findByText("Chatting as Alice");
      first.unmount();

      const { server } = setup();

      await screen.findByText("Chatting as Alice");
      expect(path()).toBe("/rooms/general");
      expect(server.latest.emittedEvents("room:join")).toEqual([
        { slug: "general" },
      ]);
    });

    it("asks again, with the reason, when the saved moderator token has expired", async () => {
      save({ nickname: "Ada Mod", token: "stale" });
      goTo("/rooms/general");
      setup(makeFakeServer({ handshakeError: "invalid_token" }));

      expect(
        await within(await screen.findByRole("dialog")).findByRole("alert"),
      ).toHaveTextContent("Your moderator session has expired");
      expect(sessionStorage.getItem(SAVED)).toBeNull();
    });

    it("does not try again with a nickname that is no longer accepted", async () => {
      save({ nickname: "Alice" });
      goTo("/rooms/general");
      const { server } = setup(makeFakeServer({ handshakeError: "banned" }));

      expect(
        await within(await screen.findByRole("dialog")).findByRole("alert"),
      ).toHaveTextContent("You are banned from this chat.");
      expect(sessionStorage.getItem(SAVED)).toBeNull();
      expect(server.createSocket).toHaveBeenCalledTimes(1);
    });

    it("shows the lobby, and a clean address, for a room that does not exist", async () => {
      goTo("/rooms/nowhere");
      setup();

      await screen.findByRole("heading", { name: "Public rooms" });

      await waitFor(() => expect(path()).toBe("/"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("stays in the lobby, without connecting, when the address is the lobby", async () => {
      save({ nickname: "Alice" });
      const { server } = setup();

      await screen.findByRole("heading", { name: "Public rooms" });

      expect(server.createSocket).not.toHaveBeenCalled();
    });

    it("waits for the rooms before deciding, and joins once they are known", async () => {
      save({ nickname: "Alice" });
      goTo("/rooms/music");
      let release: () => void = () => {};
      stubRooms(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ ok: true, json: async () => ROOMS });
          }),
      );
      const { server } = setup();

      expect(server.createSocket).not.toHaveBeenCalled();
      release();

      await screen.findByText("Chatting as Alice");
    });
  });

  describe("what is remembered", () => {
    it("remembers nothing from a nickname the server turned down", async () => {
      const { user } = setup(makeFakeServer({ handshakeError: "banned" }));

      await joinRoom(user);
      await screen.findByRole("alert");

      expect(sessionStorage.getItem(SAVED)).toBeNull();
    });

    it("remembers a moderator's token, never their email or password", async () => {
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
      const { user } = setup();
      await user.click(
        await screen.findByRole("button", { name: "Join General" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Sign in as moderator" }),
      );
      await user.type(screen.getByLabelText("Email"), "ada@example.com");
      await user.type(screen.getByLabelText("Password"), "correct horse");
      await user.click(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByText("Chatting as Ada Mod");

      const saved = sessionStorage.getItem(SAVED) ?? "";
      expect(JSON.parse(saved)).toEqual({
        nickname: "Ada Mod",
        token: "signed-token",
        guestIds: ["guest-me"],
        resume: { guestId: "guest-me", secret: "secret-1" },
      });
      expect(saved).not.toContain("correct horse");
      expect(saved).not.toContain("ada@example.com");
    });

    it("forgets it when the guest is banned out of the chat", async () => {
      const { user, server } = setup();
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      act(() => {
        server.latest.serverEmit("kicked", { reason: "banned" });
        server.latest.serverEmit("disconnect", "io server disconnect");
      });

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(sessionStorage.getItem(SAVED)).toBeNull();
    });

    it("forgets it when the guest gives up reconnecting", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [150, 150]);
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      act(() => server.latest.serverEmit("disconnect", "transport close"));
      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(sessionStorage.getItem(SAVED)).toBeNull();
      expect(path()).toBe("/");
    });

    it("keeps it while the guest is only out of the room", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByText("Chatting as Alice");

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });

      expect(JSON.parse(sessionStorage.getItem(SAVED) ?? "null")).toEqual({
        nickname: "Alice",
        guestIds: ["guest-me"],
        resume: { guestId: "guest-me", secret: "secret-1" },
      });
    });

    it("copes with a saved value that is not what it expects", async () => {
      sessionStorage.setItem(SAVED, "{not json");
      goTo("/rooms/general");
      const { server } = setup();

      expect(await screen.findByLabelText("Nickname")).toBeInTheDocument();
      expect(server.createSocket).not.toHaveBeenCalled();
    });
  });
});

describe("a connection that keeps failing", () => {
  it("tries again at once when the browser is back online, instead of waiting out the delay", async () => {
    const server = makeFakeServer();
    const { user } = setup(server, [60_000]);
    await joinRoom(user);
    await screen.findByText("Chatting as Alice");

    act(() => server.latest.serverEmit("disconnect", "transport close"));
    await screen.findByRole("status");
    expect(server.createSocket).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await screen.findByText("Chatting as Alice");
  });

  it("tries again at once when the guest comes back to the tab", async () => {
    const server = makeFakeServer();
    const { user } = setup(server, [60_000]);
    await joinRoom(user);
    await screen.findByText("Chatting as Alice");

    act(() => server.latest.serverEmit("disconnect", "transport close"));
    await screen.findByRole("status");

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
  });

  it("keeps trying for a few minutes before giving up", async () => {
    const delays = DEFAULT_RECONNECT_DELAYS_MS;

    expect(delays.reduce((total, delay) => total + delay, 0)).toBeGreaterThan(
      180_000,
    );
    expect(Math.max(...delays)).toBeLessThanOrEqual(30_000);
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
