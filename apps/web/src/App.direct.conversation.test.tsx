import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as notificationSound from "./notificationSound";
import { loadNotificationSound } from "./preferences";

import { setup, stubRooms } from "./test/app";
import {
  bob,
  carol,
  ada,
  dm,
  fromMe,
  present,
  enter,
  people,
  threads,
  threadAction,
  receive,
  pane,
  log,
} from "./test/direct";

beforeEach(() => {
  stubRooms();
});

describe("private-message notification sounds", () => {
  beforeEach(() => {
    vi.spyOn(notificationSound, "playNotificationSound").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());

  async function openSettings(user: Awaited<ReturnType<typeof enter>>["user"]) {
    await user.click(
      screen.getByRole("button", { name: "Account menu: Alice" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Settings" }));
    return screen.findByRole("checkbox", { name: "Private message sounds" });
  }

  it("offers sectioned settings before joining or signing in", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Settings" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "General" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Chat activity" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Notification sounds" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(screen.getByRole("dialog", { name: "Settings" })).toHaveFocus();
    expect(
      screen.getByRole("checkbox", { name: "Private message sounds" }),
    ).not.toHaveFocus();
    expect(
      screen.getByRole("checkbox", {
        name: "Show a message in the chat when someone joins or leaves the room.",
      }),
    ).not.toBeChecked();
  });

  it("allows volume adjustment and previews while notification sounds are off", async () => {
    const { user } = await enter();
    expect(await openSettings(user)).not.toBeChecked();
    const volume = screen.getByRole("slider", { name: "Volume" });
    expect(volume).toBeEnabled();
    expect(volume).toHaveValue("50");
    fireEvent.change(volume, { target: { value: "25" } });
    expect(loadNotificationSound().volume).toBe(0.25);
    expect(volume).toHaveAttribute("aria-valuetext", "25%");
    expect(screen.getByRole("button", { name: "Preview sound" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Preview sound" }));
    expect(notificationSound.playNotificationSound).toHaveBeenCalledWith({
      preview: true,
    });
    expect(loadNotificationSound().enabled).toBe(false);
  });

  it("opens category settings instead of a private-only menu toggle", async () => {
    const { user } = await enter();
    await user.click(
      screen.getByRole("button", { name: "Account menu: Alice" }),
    );
    expect(
      screen.queryByRole("menuitem", {
        name: "Private message sounds",
      }),
    ).not.toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(
      items.indexOf(screen.getByRole("menuitem", { name: "Settings" })),
    ).toBe(
      items.indexOf(screen.getByRole("menuitem", { name: "Your profile" })) + 1,
    );
    expect(
      screen.queryByRole("menuitem", { name: "Joins and leaves" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "English" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(
      screen.getByRole("checkbox", { name: "Private message sounds" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Warnings" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "People joining" }),
    ).not.toBeChecked();
  });

  it("enables sound, remembers volume and offers a preview", async () => {
    const { user } = await enter();
    await user.click(await openSettings(user));
    const volume = screen.getByRole("slider", { name: "Volume" });
    expect(volume).toBeEnabled();
    fireEvent.change(volume, { target: { value: "25" } });
    expect(loadNotificationSound()).toEqual({
      enabled: true,
      volume: 0.25,
      sound: "chime",
    });
    expect(volume).toHaveAttribute("aria-valuetext", "25%");
    await user.click(screen.getByRole("button", { name: "Preview sound" }));
    expect(notificationSound.playNotificationSound).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(await openSettings(user)).toBeChecked();
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("25");
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0" },
    });
    expect(screen.getByRole("button", { name: "Preview sound" })).toBeEnabled();
    await user.click(
      screen.getByRole("checkbox", { name: "Private message sounds" }),
    );
    expect(loadNotificationSound()).toEqual({
      enabled: false,
      volume: 0,
      sound: "chime",
    });
  });

  it("enables warnings and joins independently and saves their chosen sounds", async () => {
    const { user } = await enter();
    await openSettings(user);
    await user.click(screen.getByRole("checkbox", { name: "Warnings" }));
    await user.click(
      screen.getByRole("button", { name: "Sound for Warnings" }),
    );
    await user.click(await screen.findByRole("option", { name: "Bell" }));
    await user.click(screen.getByRole("checkbox", { name: "People joining" }));
    await user.click(
      screen.getByRole("button", { name: "Sound for People joining" }),
    );
    await user.click(await screen.findByRole("option", { name: "Wood" }));
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "30" },
    });
    expect(loadNotificationSound()).toEqual({
      enabled: false,
      volume: 0.3,
      warnings: { enabled: true, sound: "bell" },
      joins: { enabled: true, sound: "wood" },
    });
    await user.click(screen.getByRole("button", { name: "Preview Warnings" }));
    expect(notificationSound.playNotificationSound).toHaveBeenLastCalledWith({
      preview: true,
      kind: "warnings",
    });
    await user.click(screen.getByRole("checkbox", { name: "Warnings" }));
    expect(screen.getByRole("slider", { name: "Volume" })).toBeEnabled();
    expect(
      screen.getByRole("checkbox", { name: "People joining" }),
    ).toBeChecked();
  });

  it("notifies only for new live joins and valid warnings without duplicate alerts", async () => {
    const { server } = await enter();
    vi.mocked(notificationSound.playNotificationSound).mockClear();
    const joined = {
      id: "bob-arrives",
      roomSlug: "general",
      event: "joined",
      guestId: bob.guestId,
      nickname: "Bob",
      sentAt: new Date().toISOString(),
    };
    act(() => {
      server.latest.serverEmit("room:event", joined);
      server.latest.serverEmit("room:event", joined);
      server.latest.serverEmit("room:event", {
        ...joined,
        id: "self",
        guestId: "guest-me",
      });
      server.latest.serverEmit("room:event", {
        ...joined,
        id: "elsewhere",
        roomSlug: "music",
      });
      server.latest.serverEmit("room:event", {
        ...joined,
        id: "left",
        event: "left",
      });
      server.latest.serverEmit("idle:warning", { remainingMs: 60_000 });
      server.latest.serverEmit("idle:warning", { remainingMs: 59_000 });
      server.latest.serverEmit("idle:warning", { remainingMs: 0 });
    });
    expect(
      vi.mocked(notificationSound.playNotificationSound).mock.calls,
    ).toEqual([[{ kind: "joins" }], [{ kind: "warnings" }]]);
    act(() => {
      server.latest.serverEmit("idle:cleared", undefined);
      server.latest.serverEmit("idle:warning", { remainingMs: 60_000 });
      server.latest.serverEmit("kicked", { reason: "banned" });
    });
    expect(notificationSound.playNotificationSound).toHaveBeenCalledTimes(4);
  });

  it("notifies once for new incoming messages, not duplicates, own messages or malformed events", async () => {
    const { server } = await enter();
    const incoming = dm();
    receive(server, incoming);
    receive(server, incoming);
    receive(server, fromMe(bob, "my reply"));
    act(() => server.latest.serverEmit("dm:new", { text: "invalid" }));
    expect(notificationSound.playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("notifies for a new message even when its conversation is open", async () => {
    const { user, server } = await enter();
    await user.click(
      people().getByRole("button", { name: "Open private chat with Bob" }),
    );
    receive(server, dm());
    expect(notificationSound.playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("respects muting and unmuting a conversation", async () => {
    const { user, server } = await enter();
    receive(server, dm());
    vi.mocked(notificationSound.playNotificationSound).mockClear();
    await threadAction(user, "Bob", "Stop notifications from Bob");
    receive(server, dm({ text: "muted arrival" }));
    expect(notificationSound.playNotificationSound).not.toHaveBeenCalled();
    await threadAction(user, "Bob", "Turn on notifications from Bob");
    receive(server, dm({ text: "unmuted arrival" }));
    expect(notificationSound.playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("does not notify for a blocked sender", async () => {
    const { user, server } = await enter();
    await user.click(
      people().getByRole("button", { name: "Open private chat with Bob" }),
    );
    await user.click(screen.getByRole("button", { name: "Block Bob" }));
    await screen.findAllByRole("button", { name: "Unblock Bob" });
    receive(server, dm());
    expect(notificationSound.playNotificationSound).not.toHaveBeenCalled();
  });
});

describe("direct messages", () => {
  describe("the conversation", () => {
    it("opens from a name in the people list, with what was said in it", async () => {
      const { user, server } = await enter();
      const socket = server.latest;
      receive(server, dm({ text: "first" }));
      receive(server, fromMe(bob, "second"));

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

      expect(pane("Bob")).toBeInTheDocument();
      expect(log("Bob").getByText("first")).toBeInTheDocument();
      expect(log("Bob").getByText("second")).toBeInTheDocument();
      expect(server.latest).toBe(socket);
    });

    it("opens from the list of conversations", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(pane("Bob")).toBeInTheDocument();
    });

    it("takes the place of the room's messages, and the way back is clear", async () => {
      const { user } = await enter();

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

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

    it("puts the cursor in the room's message box when going back, except after a tap", async () => {
      const { user } = await enter();
      const back = () =>
        user.click(screen.getByRole("button", { name: "Back to the room" }));

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );
      await back();
      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus(),
      );

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );
      document.documentElement.setAttribute("data-pointer", "touch");
      try {
        await back();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(
          screen.getByRole("textbox", { name: "Message" }),
        ).not.toHaveFocus();
      } finally {
        document.documentElement.removeAttribute("data-pointer");
      }
    });

    it("shows who said what, and renders words as text", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "<img src=x onerror=alert(1)>" }));
      receive(server, fromMe(bob, "my answer"));

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

      expect(log("Bob").getByText("Bob")).toBeInTheDocument();
      // What the guest said is on the right and has no name, as in Teams.
      expect(log("Bob").queryByText("Alice")).toBeNull();
      expect(log("Bob").getByText("my answer").closest("li")).toHaveAttribute(
        "data-side",
        "right",
      );
      expect(
        log("Bob").getByText("<img src=x onerror=alert(1)>"),
      ).toBeInTheDocument();
      expect(document.querySelector("img[src='x']")).toBeNull();
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

      await user.click(
        people().getByRole("button", {
          name: "Open private chat with Ada Mod",
        }),
      );

      expect(log("Ada Mod").getByText("please keep it friendly")).toHaveClass(
        "font-bold",
        "text-green-300",
      );
      expect(log("Ada Mod").getByText("Moderator")).toBeInTheDocument();
    });

    it("sends what was written to that person and clears the box", async () => {
      const { user, server } = await enter();
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

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
        ).toHaveDraft(""),
      );
    });

    it("sends nothing when the box is empty", async () => {
      const { user, server } = await enter();
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "   ",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(server.latest.emittedEvents("dm:send")).toEqual([]);
    });

    it("shows the message once the server has delivered it, not before", async () => {
      const { user, server } = await enter();
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );
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

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

      expect(log("Bob").getAllByText("once")).toHaveLength(1);
    });

    it("explains how long to wait, and keeps the words", async () => {
      const { user, server } = await enter();
      server.latest.acks["dm:send"] = () => ({
        ok: false,
        error: "rate_limited",
        retryAfterMs: 2_100,
      });
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

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
      ).toHaveDraft("again");
    });

    it("explains when the person has gone", async () => {
      const { user, server } = await enter();
      server.latest.acks["dm:send"] = () => ({
        ok: false,
        error: "user_not_found",
      });
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "hello?",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Bob is not in this room any more.",
      );
    });

    it("clears an explanation once the next try works", async () => {
      const { user, server } = await enter();
      const answers = [
        { ok: false, error: "rate_limited", retryAfterMs: 1_000 },
        { ok: true },
      ];
      server.latest.acks["dm:send"] = () => answers.shift();
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );
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
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Message to Bob" }),
        "hello?",
      );
      await user.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByRole("alert");
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      await user.click(
        people().getByRole("button", { name: "Open private chat with Carol" }),
      );

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message to Carol" }),
      ).toHaveDraft("");
    });
  });

  describe("when the other person is not there", () => {
    it("says so and does not let the guest write, until they are back", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).not.toBeLocked();

      present(server, [carol, ada]);

      expect(screen.getByRole("status")).toHaveTextContent(
        "Bob is offline right now.",
      );
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeLocked();
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      // What was said stays readable.
      expect(log("Bob").getByText("hi Alice")).toBeInTheDocument();

      present(server, [bob, carol, ada]);

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).not.toBeLocked();
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
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(log("Bob").queryByText("something nasty")).not.toBeInTheDocument();
      expect(log("Bob").getByText("This user was banned")).toBeInTheDocument();
      // What the guest wrote is theirs to keep.
      expect(log("Bob").getByText("stop that")).toBeInTheDocument();
    });
  });
});
