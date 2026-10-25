import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { stubRooms } from "./test/app";
import { publicIdentityTag } from "./identity";
import {
  bob,
  carol,
  ada,
  dm,
  fromMe,
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

describe("direct messages", () => {
  describe("conversation actions", () => {
    it("opens a public profile with the keyboard and restores focus when closed", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      const avatar = threads().getByRole("button", {
        name: "Profile: Bob",
      });
      avatar.focus();
      await user.keyboard("{Enter}");
      const profile = within(
        await screen.findByRole("dialog", {
          name: "Profile: Bob",
        }),
      );
      expect(profile.getByText("Bob")).toBeVisible();
      expect(profile.getByLabelText("Gender")).toHaveTextContent("Male");
      expect(profile.getAllByText("Male")).toHaveLength(1);
      expect(profile.getByText("Status")).toBeVisible();
      expect(profile.getByLabelText("Status")).toHaveTextContent("Online");
      expect(profile.getByLabelText("Status")).toHaveClass("text-right");
      expect(profile.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("menu")).toBeNull();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(avatar).toHaveFocus());
    });

    it("keeps long public identities out of the avatar profile", async () => {
      const person = {
        ...bob,
        guestId: "test-lab-guest-with-a-long-identity",
        nickname: "coffee_heron2",
      };
      const { user, server } = await enter([person]);
      receive(
        server,
        dm({ fromGuestId: person.guestId, fromNickname: person.nickname }),
      );
      await user.click(
        threads().getByRole("button", { name: "Profile: coffee_heron2" }),
      );
      const profile = await screen.findByRole("dialog", {
        name: "Profile: coffee_heron2",
      });
      expect(within(profile).getByLabelText("Public tag").textContent).toBe(
        publicIdentityTag(person.guestId).slice(-8),
      );
      expect(profile).not.toHaveTextContent(publicIdentityTag(person.guestId));
    });

    it("blocks and unblocks a conversation from its actions menu", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(
        threads().getByRole("button", { name: "Actions for Bob" }),
      );
      await user.click(
        await screen.findByRole("menuitem", { name: "Block Bob" }),
      );
      await waitFor(() => expect(threads().getByText("Blocked")).toBeVisible());
      expect(screen.queryByRole("menu")).toBeNull();
      await user.click(
        threads().getByRole("button", { name: "Actions for Bob" }),
      );
      expect(
        await screen.findByRole("menuitem", {
          name: "Stop notifications from Bob",
        }),
      ).toBeVisible();
      expect(
        screen.queryByRole("menuitem", { name: "View profile" }),
      ).toBeNull();
      await user.click(screen.getByRole("menuitem", { name: "Unblock Bob" }));
      await waitFor(() => expect(threads().queryByText("Blocked")).toBeNull());
    });

    it("does not offer blocking a moderator", async () => {
      const { user, server } = await enter();
      receive(
        server,
        dm({
          fromGuestId: ada.guestId,
          fromNickname: ada.nickname,
          fromRole: "moderator",
          fromAvatar: "other",
        }),
      );
      await user.click(
        threads().getByRole("button", { name: "Actions for Ada Mod" }),
      );
      expect(
        await screen.findByRole("menuitem", {
          name: "Stop notifications from Ada Mod",
        }),
      ).toBeVisible();
      expect(
        screen.queryByRole("menuitem", { name: "View profile" }),
      ).toBeNull();
      expect(screen.queryByRole("menuitem", { name: /Block/ })).toBeNull();
    });
  });

  describe("the lists", () => {
    it("opens the panel above the box from the People button, and closes it when a conversation is chosen", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      const toggle = screen.getByRole("button", {
        name: /^People and direct messages/,
      });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");

      const sheet = within(
        screen.getByRole("region", { name: "People and direct messages" }),
      );
      await user.click(
        sheet
          .getByRole("list", { name: "Direct messages" })
          .querySelector("button[aria-pressed]")!,
      );

      expect(pane("Bob")).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "People and direct messages" }),
      ).toBeNull();
    });

    it("shows the people in the room as buttons, and no direct messages yet", async () => {
      await enter();

      expect(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      ).toBeInTheDocument();
      expect(
        people().getByRole("button", {
          name: "Open private chat with Ada Mod",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });

    it("lists the guest too, but there is nobody to write to when they are alone", async () => {
      await enter([]);

      expect(people().getByText("Alice")).toBeInTheDocument();
      expect(people().getByText("(you)")).not.toHaveClass("sr-only");
      expect(
        people().getByText("Alice").closest("li")?.firstElementChild,
      ).toHaveClass("bg-neutral-800/40");
      expect(
        people().getByRole("button", { name: /^Profile: Alice/ }),
      ).toBeInTheDocument();
      expect(people().queryByRole("button", { name: "Alice" })).toBeNull();
    });

    it("does not offer to write to oneself", async () => {
      await enter();

      expect(people().getByText("Alice")).toBeInTheDocument();
      expect(people().queryByRole("button", { name: "Alice" })).toBeNull();
      expect(people().getAllByRole("button")).toHaveLength(10);
    });

    it("chooses who to write to privately by clicking a person, and again to stop", async () => {
      const { user } = await enter();

      await user.click(people().getByRole("button", { name: /^Bob/ }));

      expect(screen.getByText("Private: Bob")).toBeInTheDocument();
      expect(people().getByRole("button", { name: /^Bob/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await user.click(people().getByRole("button", { name: /^Bob/ }));

      expect(screen.queryByText("Private: Bob")).not.toBeInTheDocument();
    });

    it("closes the private writing bar, or goes into the private chat from it", async () => {
      const { user } = await enter();

      await user.click(people().getByRole("button", { name: /^Bob/ }));
      await user.click(
        screen.getByRole("button", { name: "Stop writing privately" }),
      );
      expect(screen.queryByText("Private: Bob")).not.toBeInTheDocument();

      await user.click(people().getByRole("button", { name: /^Bob/ }));
      await user.click(
        screen.getByRole("button", { name: "Open private chat" }),
      );
      expect(pane("Bob")).toBeInTheDocument();
    });

    it("opens the private chat from the arrow next to a person", async () => {
      const { user } = await enter();

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

      expect(pane("Bob")).toBeInTheDocument();
    });

    it("adds a conversation when somebody writes to the guest", async () => {
      const { server } = await enter();

      receive(server, dm());

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("No direct messages yet."),
      ).not.toBeInTheDocument();
    });

    it("adds a conversation when the guest writes to somebody", async () => {
      const { server } = await enter();

      receive(server, fromMe(carol));

      expect(
        threads().getByRole("button", { name: /^Carol/ }),
      ).toBeInTheDocument();
    });

    it("keeps the people list as it was", async () => {
      const { server } = await enter();

      receive(server, dm());

      expect(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      ).toBeInTheDocument();
    });

    it("does not add a conversation just because somebody was opened", async () => {
      const { user } = await enter();

      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

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

      const conversations = () =>
        threads()
          .getAllByRole("button", { pressed: false })
          .map((button) => button.textContent);
      const names = conversations();
      expect(names[0]).toMatch(/Carol/);
      expect(names[1]).toMatch(/Bob/);

      receive(server, dm({ text: "again" }));

      expect(conversations()[0]).toMatch(/Bob/);
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

      expect(
        people().getByText("Ada Mod").closest(".text-green-400"),
      ).toBeInTheDocument();
      expect(
        threads().getByText("Ada Mod").closest(".text-green-400"),
      ).toBeInTheDocument();
    });

    it("ignores a message that is not shaped like one", async () => {
      const { server } = await enter();

      receive(server, { id: "x", text: "no sender" });
      receive(server, dm({ text: 42 }));

      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });
  });

  describe("new activity", () => {
    it("counts what has not been seen in the title of the page, until it is opened", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      receive(server, dm({ text: "are you there?" }));

      expect(document.title).toBe("(2 messages) General \u2013 Chatter");

      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      await waitFor(() =>
        expect(document.title).toBe("General \u2013 Chatter"),
      );
    });

    it("makes a conversation stand out, with a count, until it is opened", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      receive(server, dm({ text: "are you there?" }));

      const button = threads().getByRole("button", { name: /^Bob/ });
      expect(button).toHaveAccessibleName(/Bob.*2 unread messages/);
      expect(button.parentElement).toHaveClass("motion-safe:animate-pulse");

      await user.click(button);
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      const read = threads().getByRole("button", { name: /^Bob/ });
      expect(read).not.toHaveAccessibleName(/unread/);
      expect(read.parentElement).not.toHaveClass("motion-safe:animate-pulse");
    });

    it("is cleared, for all of what somebody wrote, by clicking one of their private messages", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "first" }));
      receive(server, dm({ text: "second" }));
      receive(
        server,
        dm({ fromGuestId: carol.guestId, fromNickname: "Carol", text: "hi" }),
      );

      await user.click(screen.getByText("first"));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        threads().getByRole("button", { name: /^Carol/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("is cleared by clicking the name of who wrote them, which also chooses them to write to", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "first" }));
      receive(server, dm({ text: "second" }));

      await user.click(screen.getByText("Direct message from Bob"));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        await screen.findByRole("textbox", { name: "Message to Bob" }),
      ).toBeInTheDocument();
    });

    it("is cleared by clicking the name on what they said in the room too", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      act(() =>
        server.latest.serverEmit("message:new", {
          id: "r1",
          roomSlug: "general",
          guestId: bob.guestId,
          nickname: "Bob",
          text: "in the room",
          sentAt: new Date().toISOString(),
        }),
      );

      await user.click(
        within(screen.getByRole("log", { name: "General" })).getByText("Bob"),
      );

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
    });

    it("says one unread message in the singular", async () => {
      const { server } = await enter();

      receive(server, dm());

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/1 unread message$/);
    });

    it("is cleared for somebody once the guest has written back to them", async () => {
      const { server } = await enter();
      receive(server, dm());
      receive(
        server,
        dm({
          fromGuestId: carol.guestId,
          fromNickname: "Carol",
          text: "hi",
        }),
      );

      receive(server, fromMe(bob, "on my way"));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        threads().getByRole("button", { name: /^Carol/ }),
      ).toHaveAccessibleName(/1 unread message/);
      expect(
        screen.getByRole("button", {
          name: /^People and direct messages, 1 unread message/,
        }),
      ).toBeInTheDocument();
    });

    it("is not triggered by what the guest wrote themselves", async () => {
      const { server } = await enter();

      receive(server, fromMe(bob));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
    });

    it("is not triggered while that conversation is open", async () => {
      const { user, server } = await enter();
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

      receive(server, dm({ text: "right here" }));

      expect(log("Bob").getByText("right here")).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );
      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
    });

    it("still stands out for another conversation while one is open", async () => {
      const { user, server } = await enter();
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );

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
        threads().getByRole("button", { name: /^Carol/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("stays when the message is only reached with the keyboard, not clicked", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "psst" }));

      (
        screen.getByRole("log").querySelector("[data-nav-id]") as HTMLElement
      ).focus();
      await user.keyboard("{Escape}");

      expect(
        screen.getByRole("button", {
          name: /^People and direct messages, 1 unread message/,
        }),
      ).toBeInTheDocument();
      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("are narrowed by the search above the people, and say so when nobody matches", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      receive(
        server,
        dm({
          fromGuestId: carol.guestId,
          fromNickname: "Carol",
          text: "hi",
        }),
      );

      await user.type(
        screen.getByRole("searchbox", { name: "Search people" }),
        "bo",
      );

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toBeInTheDocument();
      expect(threads().queryByRole("button", { name: /^Carol/ })).toBeNull();

      await user.type(
        screen.getByRole("searchbox", { name: "Search people" }),
        "zz",
      );

      expect(
        screen.queryByRole("list", { name: "Direct messages" }),
      ).toBeNull();
      expect(screen.getAllByText("Nobody matches.")).toHaveLength(2);
    });

    it("can be switched off for one person, and back on", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      receive(
        server,
        dm({
          fromGuestId: carol.guestId,
          fromNickname: "Carol",
          text: "hi",
        }),
      );

      await threadAction(user, "Bob", "Stop notifications from Bob");

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        threads().getByRole("button", { name: /^Carol/ }),
      ).toHaveAccessibleName(/1 unread message/);
      await user.click(
        threads().getByRole("button", { name: "Actions for Bob" }),
      );
      expect(
        await screen.findByRole("menuitem", {
          name: "Turn on notifications from Bob",
        }),
      ).toBeVisible();
      await user.keyboard("{Escape}");

      receive(server, dm({ text: "still muted" }));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        screen.getByRole("log").querySelectorAll("[data-nav-id]"),
      ).toHaveLength(3);

      await threadAction(user, "Bob", "Turn on notifications from Bob");
      receive(server, dm({ text: "audible again" }));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("counts a first message from somebody whose name was clicked but never written to", async () => {
      const { user, server } = await enter();
      await user.click(
        people().getByRole("button", { name: "Open private chat with Bob" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      receive(server, dm());

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });
  });
});
