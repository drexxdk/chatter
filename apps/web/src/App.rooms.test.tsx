import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ROOMS, stubRooms, setup, joinRoom, at, message } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

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

    expect(
      await screen.findByRole("button", { name: "Your profile: Alice" }),
    ).toBeInTheDocument();
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
    await screen.findByRole("button", { name: "Your profile: Alice" });
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
        .getAllByText(/^(first|second)$/)
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

  describe("the message box", () => {
    it("sends on Enter, and starts a new line on Shift+Enter", async () => {
      const { user, server } = await enterRoom();
      const box = screen.getByLabelText("Message");

      await user.type(box, "first{Shift>}{Enter}{/Shift}second");
      expect(box).toHaveValue("first\nsecond");
      expect(server.latest.emittedEvents("message:send")).toEqual([]);

      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(server.latest.emittedEvents("message:send")).toEqual([
          { text: "first\nsecond" },
        ]),
      );
    });

    it("starts as one line and holds at most 500 characters", async () => {
      await enterRoom();
      const box = screen.getByLabelText("Message");

      expect(box).toHaveAttribute("rows", "1");
      expect(box).toHaveAttribute("maxlength", "500");
    });

    it("shows the lines of a message", async () => {
      const { server } = await enterRoom();

      act(() =>
        server.latest.serverEmit("message:new", message({ text: "one\ntwo" })),
      );

      expect(
        screen.getByText(
          (_, element) =>
            element?.textContent === "one\ntwo" && element.tagName === "P",
        ),
      ).toHaveClass("whitespace-pre-wrap");
    });
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
      await screen.findByRole("button", { name: "Your profile: Alice" });
      return result;
    }

    it("tells the guest how often they may write, in the info panel", async () => {
      const { user } = await enterSlowRoom(10);

      await user.click(screen.getByRole("button", { name: "Menu" }));
      await user.click(
        await screen.findByRole("menuitem", { name: "How the chat works" }),
      );

      expect(
        within(await screen.findByRole("dialog")).getByText(
          "Slow mode: one message every 10 s.",
        ),
      ).toBeInTheDocument();
    });

    it.each([
      ["without the setting", undefined],
      ["with it empty", null],
    ])("says nothing about it in a room %s", async (_label, value) => {
      const { user } = await enterSlowRoom(value);

      await user.click(screen.getByRole("button", { name: "Menu" }));
      await user.click(
        await screen.findByRole("menuitem", { name: "How the chat works" }),
      );
      await screen.findByRole("dialog");

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

  it("switches to another room from the room name in the header", async () => {
    const { user, server } = await enterRoom();

    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(await screen.findByRole("option", { name: /Music/ }));

    expect(
      await screen.findByRole("heading", { name: "Music", level: 2 }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
      { slug: "music" },
    ]);
    expect(server.latest.emittedEvents("room:leave")).toEqual([]);
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
    await screen.findByRole("button", { name: "Your profile: Alice" });
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
    await screen.findByRole("button", { name: "Your profile: Alice" });
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
    await screen.findByRole("button", { name: "Your profile: Alice" });
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
