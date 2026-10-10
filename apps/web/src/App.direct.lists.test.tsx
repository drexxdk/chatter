import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { stubRooms } from "./test/app";
import {
  bob,
  carol,
  ada,
  dm,
  fromMe,
  enter,
  people,
  threads,
  receive,
  pane,
  log,
} from "./test/direct";

beforeEach(() => {
  stubRooms();
});

describe("direct messages", () => {
  describe("the lists", () => {
    it("opens the conversations in the slide-out next to the recipient, which closes when one is chosen", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(screen.getByRole("button", { name: /^Send to:/ }));
      const drawer = within(await screen.findByRole("dialog"));
      await user.click(
        drawer
          .getByRole("list", { name: "Direct messages" })
          .querySelector("button")!,
      );

      expect(pane("Bob")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

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

      const conversations = () =>
        threads()
          .getAllByRole("button")
          .filter((button) => !button.hasAttribute("aria-pressed"))
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

      const button = threads().getByRole("button", { name: /^Bob/ });
      expect(button).toHaveAccessibleName(/Bob.*2 unread messages/);
      expect(button).toHaveClass("motion-safe:animate-pulse");

      await user.click(button);
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      const read = threads().getByRole("button", { name: /^Bob/ });
      expect(read).not.toHaveAccessibleName(/unread/);
      expect(read).not.toHaveClass("motion-safe:animate-pulse");
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
        screen.getByRole("button", { name: /^Send to:.*1 unread message/ }),
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
      await user.click(people().getByRole("button", { name: "Bob" }));

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
        threads().getByRole("button", { name: /^Carol/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("stays until the conversation is opened, whatever is clicked in the chat", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "psst" }));

      await user.click(
        screen.getByRole("log").querySelector("[data-nav-id]") as HTMLElement,
      );
      await user.keyboard("{Escape}");

      expect(
        screen.getByRole("button", { name: /^Send to:.*1 unread message/ }),
      ).toBeInTheDocument();
      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("can be switched off for everybody, which clears what is unread and remembers the choice", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      const notify = () =>
        screen.getByRole("switch", { name: "Notify me about direct messages" });

      expect(notify()).toBeChecked();

      await user.click(notify());

      expect(notify()).not.toBeChecked();
      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(localStorage.getItem("chatter.notifyDirect")).toBe("false");

      receive(server, dm({ text: "again" }));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        screen.getByRole("button", { name: /^Send to:/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        screen.getByRole("log").querySelectorAll("[data-nav-id]"),
      ).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: "Stop notifications from Bob" }),
      ).toBeDisabled();
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

      await user.click(
        screen.getByRole("button", { name: "Stop notifications from Bob" }),
      );

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        threads().getByRole("button", { name: /^Carol/ }),
      ).toHaveAccessibleName(/1 unread message/);
      expect(
        screen.getByRole("button", { name: "Turn on notifications from Bob" }),
      ).toHaveAttribute("aria-pressed", "true");

      receive(server, dm({ text: "still muted" }));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
      expect(
        screen.getByRole("log").querySelectorAll("[data-nav-id]"),
      ).toHaveLength(3);

      await user.click(
        screen.getByRole("button", { name: "Turn on notifications from Bob" }),
      );
      receive(server, dm({ text: "audible again" }));

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
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
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });
  });
});
