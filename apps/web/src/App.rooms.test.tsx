import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ROOMS,
  stubRooms,
  setup,
  joinRoom,
  leaveRoom,
  at,
  message,
  fillBox,
  anyPicture,
} from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";
import { ME, bob, dm, fromMe, receive } from "./test/direct";

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

  it("shows each room's name and description in the language of the page", async () => {
    const { default: i18n } = await import("./i18n");
    const translated = {
      ...ROOMS[0],
      translations: {
        da: { name: "Generelt", description: "Åben chat" },
        // No German description: English shows in its place.
        de: { name: "Allgemein" },
      },
    };
    stubRooms(async () => ({
      ok: true,
      json: async () => [translated, ROOMS[1]],
    }));

    try {
      setup();
      expect(
        await screen.findByRole("heading", { name: "General" }),
      ).toBeInTheDocument();

      await act(() => i18n.changeLanguage("da"));

      expect(
        screen.getByRole("heading", { name: "Generelt" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Åben chat")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Deltag i Generelt" }),
      ).toBeInTheDocument();
      // A room with nothing written in Danish keeps its English name.
      expect(
        screen.getByRole("heading", { name: "Music" }),
      ).toBeInTheDocument();

      await act(() => i18n.changeLanguage("de"));

      expect(
        screen.getByRole("heading", { name: "Allgemein" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Open chat")).toBeInTheDocument();
    } finally {
      await act(() => i18n.changeLanguage("en"));
    }
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

  it("shows how many are in each room, when the server tells", async () => {
    setup();

    const card = async (name: string) =>
      (await screen.findByRole("heading", { name }))
        .parentElement as HTMLElement;

    expect(await card("General")).toHaveTextContent("3 people here now");
    expect(await card("Music")).toHaveTextContent("Nobody here now");
    // An older chat server sends no count.
    expect(await card("Lounge")).not.toHaveTextContent(/here now/);
  });

  describe("refreshing the numbers", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fetches them again every so often while the lobby is open", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchMock = stubRooms();
      setup();
      await screen.findByRole("heading", { name: "General" });

      fetchMock.mockImplementation(
        async () =>
          ({
            ok: true,
            json: async () => [{ ...ROOMS[0], memberCount: 7 }],
          }) as never,
      );
      await act(() => vi.advanceTimersByTimeAsync(10_000));

      expect(await screen.findByText("7 people here now")).toBeInTheDocument();
    });

    it("keeps the rooms it has when a refresh fails", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchMock = stubRooms();
      setup();
      await screen.findByRole("heading", { name: "General" });

      fetchMock.mockImplementation(async () => ({ ok: false, status: 503 }));
      await act(() => vi.advanceTimersByTimeAsync(10_000));

      expect(screen.getByRole("heading", { name: "General" })).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("keeps leaving the room inside the room menu instead of beside the private-chat back button", async () => {
    const { user, server } = setup();
    await joinRoom(user);
    await screen.findByRole("button", { name: "Account menu: Alice" });
    expect(
      screen.queryByRole("button", { name: "Leave room" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Leave room" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "General" }));
    const leave = await screen.findByRole("menuitem", { name: "Leave room" });
    expect(leave.querySelector(".lucide-log-out")).toBeInTheDocument();
    await user.click(leave);
    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("room:leave")).toHaveLength(1);
  });

  it("can leave through the menu with only one room while reconnecting", async () => {
    stubRooms(async () => ({ ok: true, json: async () => [ROOMS[0]] }));
    const { user, server } = setup(makeFakeServer(), [60_000]);
    await joinRoom(user);
    await screen.findByRole("button", { name: "Account menu: Alice" });
    act(() => server.latest.serverEmit("disconnect", "transport close"));
    await user.click(screen.getByRole("button", { name: "General" }));
    expect(screen.getByRole("menuitem", { name: /General/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const leave = screen.getByRole("menuitem", { name: "Leave room" });
    expect(leave).not.toBeDisabled();
    await user.click(leave);
    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
  });

  it("fetches the numbers again when back in the lobby from a room", async () => {
    const { user } = setup();
    await joinRoom(user);
    await screen.findByRole("button", { name: "Account menu: Alice" });
    const fetchMock = stubRooms(async () => ({
      ok: true,
      json: async () => [{ ...ROOMS[0], memberCount: 5 }],
    }));

    await leaveRoom(user);

    expect(await screen.findByText("5 people here now")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      await screen.findByRole("button", { name: "Account menu: Alice" }),
    ).toBeInTheDocument();
    expect(server.createSocket).toHaveBeenCalledWith(
      "Alice",
      undefined,
      undefined,
      undefined,
      undefined,
      anyPicture,
    );
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
      await screen.findByRole("heading", { name: "In this room (1 of 100)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("shows only the number in a room without a limit", async () => {
    const { user } = setup();

    await joinRoom(user, "Lounge");

    expect(
      await screen.findByRole("heading", { name: "In this room (1)" }),
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
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

    await user.click(screen.getByRole("button", { name: "Close message" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("room queues", () => {
  it.each(["close button", "outside click"])(
    "shows a live queue position from the lobby and cancels with the %s",
    async (dismissal) => {
      const server = makeFakeServer();
      server.acks["room:join"] = () => ({ ok: false, error: "room_full" });
      server.acks["room:queue:join"] = () => ({
        ok: true,
        queued: true,
        position: 3,
      });
      const { user } = setup(server);
      await joinRoom(user);

      const dialog = await screen.findByRole("dialog", {
        name: "Queue for General",
      });
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "Position 3",
      );
      expect(screen.queryByRole("log")).not.toBeInTheDocument();
      act(() =>
        server.latest.serverEmit("room:queue", {
          roomSlug: "general",
          position: 2,
        }),
      );
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "Position 2",
      );
      expect(
        within(dialog).queryByRole("button", { name: "Leave queue" }),
      ).not.toBeInTheDocument();
      if (dismissal === "outside click") {
        await user.click(dialog);
      } else {
        await user.click(within(dialog).getByRole("button", { name: "Close" }));
      }
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(server.latest.emittedEvents("room:queue:leave")).toHaveLength(1);
      expect(
        screen.getByRole("heading", { name: "Public rooms" }),
      ).toBeInTheDocument();
      act(() =>
        server.latest.serverEmit("room:queue", {
          roomSlug: "general",
          position: 1,
        }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  async function queueSwitch() {
    const result = setup();
    await joinRoom(result.user);
    await screen.findByRole("log", { name: "General" });
    result.server.latest.acks["room:join"] = () => ({
      ok: false,
      error: "room_full",
    });
    result.server.latest.acks["room:queue:join"] = () => ({
      ok: true,
      queued: true,
      position: 2,
    });
    await result.user.click(screen.getByRole("button", { name: "General" }));
    await result.user.click(
      await screen.findByRole("menuitem", { name: /Music/ }),
    );
    await screen.findByRole("dialog", { name: "Queue for Music" });
    return result;
  }

  it("keeps the current room and incoming messages while waiting, and Escape cancels", async () => {
    const { user, server } = await queueSwitch();
    expect(window.location.pathname).toBe("/rooms/general");
    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({ text: "Still in General" }),
      ),
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("log", { name: "General" })).toHaveTextContent(
      "Still in General",
    );
    expect(window.location.pathname).toBe("/rooms/general");
    expect(server.latest.emittedEvents("room:leave")).toEqual([]);
    expect(server.latest.emittedEvents("room:queue:leave")).toHaveLength(1);
  });

  it("automatically enters the queued room with its history, presence, and live messages", async () => {
    const { server } = await queueSwitch();
    act(() => {
      server.latest.serverEmit("room:joining", { roomSlug: "music" });
      server.latest.serverEmit("room:presence", {
        roomSlug: "music",
        members: [{ guestId: "guest-me", nickname: "Alice" }],
      });
      server.latest.serverEmit(
        "message:new",
        message({ roomSlug: "music", text: "Live in Music" }),
      );
      server.latest.serverEmit("room:joined", {
        roomSlug: "music",
        history: [message({ roomSlug: "music", text: "Earlier in Music" })],
      });
    });
    const log = await screen.findByRole("log", { name: "Music" });
    expect(log).toHaveTextContent("Earlier in Music");
    expect(log).toHaveTextContent("Live in Music");
    expect(window.location.pathname).toBe("/rooms/music");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "In this room (1 of 30)" }),
    ).toBeInTheDocument();
  });

  it("closes the queue and preserves the current room if admission fails", async () => {
    const { server } = await queueSwitch();
    act(() =>
      server.latest.serverEmit("room:queue:error", {
        roomSlug: "music",
        error: "nickname_taken",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("log", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("nickname");
  });
});

describe("inside a room", () => {
  async function enterRoom() {
    const result = setup();
    await joinRoom(result.user);
    await screen.findByRole("button", { name: "Account menu: Alice" });
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
      screen.getByRole("heading", { name: "In this room (2 of 100)" }),
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
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("sends a trimmed message and clears the input", async () => {
    const { user, server } = await enterRoom();

    await user.type(screen.getByLabelText("Message"), "  hi all  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toHaveDraft(""),
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
      expect(box).toHaveDraft("first\nsecond");
      expect(server.latest.emittedEvents("message:send")).toEqual([]);

      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(server.latest.emittedEvents("message:send")).toEqual([
          { text: "first\nsecond" },
        ]),
      );
    });

    it("holds at most 500 characters", async () => {
      await enterRoom();
      const box = screen.getByLabelText("Message");

      fillBox(box, "x".repeat(500));
      fillBox(box, "y");

      expect(box.textContent).toBe("x".repeat(500));
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
    expect(screen.getByLabelText("Message")).toHaveDraft("too fast");
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
    expect(screen.getByLabelText("Message")).toHaveDraft("too fast");
  });

  it("counts the wait down, and takes the message away when it is over", async () => {
    const { user, server } = await enterRoom();
    server.latest.acks["message:send"] = () => ({
      ok: false,
      error: "rate_limited",
      retryAfterMs: 2_000,
    });

    await user.type(screen.getByLabelText("Message"), "too fast");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can send again in 2 s.",
    );
    await waitFor(
      () =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "You can send again in 1 s.",
        ),
      { timeout: 2000 },
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull(), {
      timeout: 2500,
    });
    expect(screen.getByLabelText("Message")).toHaveDraft("too fast");
  });

  describe("slow mode", () => {
    async function enterSlowRoom(slowModeSeconds?: number | null) {
      stubRooms(async () => ({
        ok: true,
        json: async () => [{ ...ROOMS[0], slowModeSeconds }, ROOMS[1]],
      }));
      const result = setup();
      await joinRoom(result.user);
      await screen.findByRole("button", { name: "Account menu: Alice" });
      return result;
    }

    it.each([
      ["with a configured delay", 10],
      ["without the setting", undefined],
      ["with it empty", null],
    ])(
      "does not offer the removed help panel in a room %s",
      async (_label, value) => {
        const { user } = await enterSlowRoom(value);

        await user.click(
          screen.getByRole("button", { name: /^(Menu|Account menu:)/ }),
        );
        await screen.findByRole("menuitem", { name: /Dansk/ });
        expect(
          screen.queryByRole("menuitem", { name: "How the chat works" }),
        ).toBeNull();
      },
    );
  });

  it("leaves the room and reuses the connection for the next room", async () => {
    const { user, server } = await enterRoom();

    await leaveRoom(user);
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

  it("names the room in the title of the page, and only the site in the lobby", async () => {
    const { user } = await enterRoom();

    await waitFor(() => expect(document.title).toBe("General \u2013 Chatter"));

    await leaveRoom(user);
    await screen.findByRole("heading", { name: "Public rooms" });
    expect(document.title).toBe("Chatter");

    await user.click(screen.getByRole("button", { name: "Join Music" }));
    await waitFor(() => expect(document.title).toBe("Music \u2013 Chatter"));
  });

  it("switches to another room from the room name in the header", async () => {
    const { user, server } = await enterRoom();

    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(await screen.findByRole("menuitem", { name: /Music/ }));

    expect(
      await screen.findByRole("heading", { name: "Music", level: 2 }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
      { slug: "music" },
    ]);
    expect(server.latest.emittedEvents("room:leave")).toEqual([]);
  });

  it("counts the people in each room in the list from the room name, out of the most it takes", async () => {
    const { user } = await enterRoom();

    await user.click(screen.getByRole("button", { name: "General" }));

    expect(
      await screen.findByRole("menuitem", { name: /Music/ }),
    ).toHaveTextContent("0/30");
    // The room you are in is shown by its own look, not by a checkmark, and is counted from who is in it now.
    expect(screen.getByRole("menuitem", { name: /General/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("menuitem", { name: /General/ })).toHaveTextContent(
      /^General\d+\/100$/,
    );
  });

  it("has the people and the direct messages open, each of which can be closed and opened from its heading", async () => {
    const { user } = await enterRoom();
    const people = () =>
      screen.queryByRole("list", { name: "People in this room" });
    const heading = await screen.findByRole("button", {
      name: /In this room/,
    });

    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(people()).toBeInTheDocument();
    expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();

    await user.click(heading);

    await waitFor(() => expect(people()).not.toBeInTheDocument());
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();

    await user.click(heading);

    expect(
      await screen.findByRole("list", { name: "People in this room" }),
    ).toBeInTheDocument();
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
    await screen.findByRole("button", { name: "Account menu: Alice" });
    expect(server.latest.disconnected).toBe(false);

    unmount();

    expect(server.latest.disconnected).toBe(true);
  });
});

describe("room search", () => {
  async function enter(history: unknown[]) {
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: true, history });
    const result = setup(server);
    await joinRoom(result.user);
    await screen.findByRole("combobox", { name: "Search messages" });
    return result;
  }

  it("searches room text and senders without exposing hidden or other-room messages", async () => {
    const { user } = await enter([
      message({ text: "Coffee with Bob", sentAt: at(1) }),
      message({ nickname: "Carol", text: "More COFFEE", sentAt: at(2) }),
      message({ roomSlug: "music", text: "Coffee elsewhere" }),
      { ...message({ text: "Coffee removed" }), banned: true },
      { ...message({ text: "Coffee reported" }), hidden: true },
    ]);
    const field = screen.getByRole("combobox", { name: "Search messages" });
    expect(field).toHaveAttribute("aria-expanded", "false");
    await user.click(field);
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(field, "cOfFeE");
    const dropdown = await screen.findByRole("region", {
      name: "Search in General",
    });
    const results = within(dropdown).getByRole("listbox", {
      name: "Message results",
    });
    expect(within(results).getAllByRole("option")).toHaveLength(2);
    expect(within(results).getAllByRole("option")[0]).toHaveTextContent(
      "More COFFEE",
    );

    expect(within(dropdown).getByRole("status")).toHaveTextContent("2 results");
    expect(results.querySelectorAll("mark")).toHaveLength(2);
    expect(results).not.toHaveTextContent(/elsewhere|removed|reported/);

    await user.clear(field);
    await user.type(field, "bob");

    const senderResults = screen.getByRole("listbox", {
      name: "Message results",
    });
    expect(within(senderResults).getAllByRole("option")).toHaveLength(1);
    expect(senderResults).toHaveTextContent("Coffee with Bob");
    expect(
      within(
        screen.getByRole("region", { name: "Search in General" }),
      ).getByRole("status"),
    ).toHaveTextContent("1 result");
  });

  it("focuses with the keyboard and hides results for empty or whitespace-only queries", async () => {
    const { user } = await enter([message({ text: "Something to find" })]);
    await user.keyboard("{Control>}f{/Control}");
    const field = screen.getByRole("combobox", { name: "Search messages" });
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(field, "no such message");
    expect(screen.getByText("No messages found.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field).toHaveAttribute("aria-expanded", "false");
    await user.type(field, "   ");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.clear(field);
    await user.type(field, "something");
    expect(screen.getByRole("listbox")).toHaveTextContent("Something to find");
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "Search in General" }),
    ).toBeNull();
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-expanded", "false");
    await user.click(field);
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.click(screen.getByRole("log"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("searches words around images without matching or previewing image URLs", async () => {
    const gif = "https://media1.giphy.com/media/URL_ONLY_TOKEN/200.gif";
    const { user, server } = await enter([
      message({ text: `Coffee above\n${gif}\nCoffee below` }),
      message({ text: gif }),
    ]);
    receive(server, dm({ text: `Private coffee\n${gif}\nAfter the image` }));
    const field = screen.getByRole("combobox", { name: "Search messages" });
    await user.type(field, "URL_ONLY_TOKEN");
    expect(screen.getByText("No messages found.")).toBeVisible();
    await user.clear(field);
    await user.type(field, "coffee");
    const results = screen.getByRole("listbox");
    expect(within(results).getAllByRole("option")).toHaveLength(2);
    expect(results).toHaveTextContent("Coffee above");
    expect(results).toHaveTextContent("Coffee below");
    expect(results).toHaveTextContent("After the image");
    expect(results).not.toHaveTextContent(/giphy|URL_ONLY_TOKEN|https:/);
  });

  it("uses the timeline's current private participant metadata in search", async () => {
    const { user, server } = await enter([]);
    receive(
      server,
      dm({
        text: "Coffee received earlier",
        fromAvatar: "male",
        fromPicture: "lorelei:abc12345",
      }),
    );
    receive(server, fromMe(bob, "Coffee sent earlier"));
    receive(
      server,
      dm({
        id: "updated-partner",
        fromNickname: "Robert",
        fromAvatar: "female",
        text: "Profile updated",
      }),
    );

    const log = screen.getByRole("log");
    expect(
      within(log).getAllByText("Direct message from Robert"),
    ).not.toHaveLength(0);
    expect(
      within(log).getByText("Direct message to Robert"),
    ).toBeInTheDocument();

    const field = screen.getByRole("combobox", { name: "Search messages" });
    await user.type(field, "coffee");
    const results = screen.getByRole("listbox", { name: "Message results" });
    const incoming = within(results).getByRole("option", {
      name: /Coffee received earlier/,
    });
    const outgoing = within(results).getByRole("option", {
      name: /Coffee sent earlier/,
    });
    expect(incoming).toHaveTextContent("Direct message from Robert");
    expect(outgoing).toHaveTextContent("Direct message to Robert");
    expect(within(incoming).getByTitle("Female")).toBeInTheDocument();
    expect(incoming.querySelector("[data-picture]")).toBeNull();

    await user.clear(field);
    await user.type(field, "Robert");
    expect(
      within(
        screen.getByRole("listbox", { name: "Message results" }),
      ).getAllByRole("option"),
    ).toHaveLength(3);
  });

  it("searches sent and received private messages and jumps to the selected message", async () => {
    const { user, server } = await enter([
      message({ text: "Coffee in the room" }),
      message({
        guestId: ME,
        nickname: "Alice",
        text: "Coffee publicly from Alice",
      }),
      message({
        guestId: "guest-mod",
        nickname: "Ada Mod",
        role: "moderator",
        text: "Coffee moderated",
      }),
    ]);
    const incoming = dm({ text: "Coffee privately from Bob" });
    receive(server, incoming);
    receive(server, fromMe(bob, "Coffee privately from Alice"));
    const target = document.querySelector<HTMLElement>(
      `[data-nav-id="${incoming.id}"]`,
    )!;
    target.scrollIntoView = vi.fn();
    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
      "coffee",
    );
    const results = screen.getByRole("listbox");
    expect(within(results).getAllByRole("option")).toHaveLength(5);
    expect(
      within(results).queryByRole("img", { name: "Private message" }),
    ).toBeNull();
    const incomingResult = within(results).getByRole("option", {
      name: /Coffee privately from Bob/,
    });
    const outgoingResult = within(results).getByRole("option", {
      name: /Coffee privately from Alice/,
    });
    const publicResult = within(results).getByRole("option", {
      name: /Coffee publicly from Alice/,
    });
    const moderatorResult = within(results).getByRole("option", {
      name: /Coffee moderated/,
    });
    expect(incomingResult.closest("li")).toHaveAttribute("data-side", "left");
    expect(outgoingResult.closest("li")).toHaveAttribute("data-side", "right");
    expect(
      within(incomingResult).getByText("Direct message from Bob"),
    ).toBeVisible();
    expect(
      within(outgoingResult).getByText("Direct message to Bob"),
    ).toBeVisible();
    expect(incomingResult.querySelector("time")).toHaveTextContent(
      "a few seconds ago",
    );
    expect(incomingResult.querySelector("time")).toHaveTextContent(
      target.closest("li")!.querySelector("time")!.textContent!,
    );
    expect(publicResult.closest("li")).toHaveAttribute("data-side", "right");
    expect(
      within(results)
        .getByRole("option", { name: /Coffee in the room/ })
        .closest("li"),
    ).toHaveAttribute("data-side", "left");
    for (const result of [incomingResult, outgoingResult]) {
      expect(result.querySelector('[class~="bg-amber-400/10"]')).toHaveClass(
        "border-dashed",
        "border-amber-400/60",
      );
      expect(within(result).getByText("Private message")).toHaveClass(
        "sr-only",
      );
    }
    expect(publicResult.querySelector(".bg-sent")).toBeInTheDocument();
    expect(
      moderatorResult.querySelector('[class~="bg-green-900/30"]'),
    ).toHaveClass("text-green-300");
    for (const [result, text, variant] of [
      [incomingResult, "Coffee privately from Bob", "private"],
      [outgoingResult, "Coffee privately from Alice", "private"],
      [publicResult, "Coffee publicly from Alice", "sent"],
      [moderatorResult, "Coffee moderated", "moderator"],
      [
        within(results).getByRole("option", { name: /Coffee in the room/ }),
        "Coffee in the room",
        "received",
      ],
    ] as const) {
      expect(result.closest("li")).toHaveAttribute(
        "data-message-variant",
        variant,
      );
      const original = screen
        .getAllByText(text)
        .find((element) => !results.contains(element));
      expect(original?.closest("[data-message-variant]")).toHaveAttribute(
        "data-message-variant",
        variant,
      );
    }
    await user.click(
      within(results).getByRole("option", {
        name: /Coffee privately from Bob/,
      }),
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute("data-search-match");
  });

  it("jumps to a result with Enter and highlights the original message", async () => {
    const item = message({ text: "Find this message" });
    const { user } = await enter([item]);
    const target = document.querySelector<HTMLElement>(
      `[data-nav-id="${item.id}"]`,
    )!;
    target.scrollIntoView = vi.fn();
    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
      "find",
    );
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option")).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute("data-search-match");
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "instant",
    });
  });

  it("resets the query and results when switching rooms", async () => {
    const { user } = await enter([
      message({ text: "General message" }),
      message({ roomSlug: "music", text: "Music message" }),
    ]);
    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
      "general",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await leaveRoom(user);
    expect(
      screen.queryByRole("combobox", { name: "Search messages" }),
    ).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Join Music" }));
    const field = await screen.findByRole("combobox", {
      name: "Search messages",
    });
    await user.click(field);
    expect(field).toHaveValue("");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(field, "message");
    const dropdown = await screen.findByRole("region", {
      name: "Search in Music",
    });
    expect(within(dropdown).getByRole("listbox")).toHaveTextContent(
      "Music message",
    );
    expect(within(dropdown).getByRole("listbox")).not.toHaveTextContent(
      "General message",
    );
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
    await screen.findByRole("button", { name: "Account menu: Alice" });
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
    expect(screen.getByLabelText("Message")).not.toBeLocked();
  });

  it("leaves a room's history behind when moving to another room", async () => {
    const { user } = await joinWithHistory([
      message({ text: "earlier one", sentAt: at(1) }),
    ]);

    await leaveRoom(user);
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
    await screen.findByRole("button", { name: "Account menu: Alice" });
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

    const items = within(screen.getByRole("log"))
      .getAllByRole("listitem")
      .filter((item) => !item.textContent?.startsWith("You joined"));
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
