import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { stubRooms, setup, at, message } from "./test/app";
import {
  ME,
  carol,
  ada,
  dm,
  fromMe,
  enter,
  receive,
  pane,
} from "./test/direct";

beforeEach(() => {
  stubRooms();
});

describe("direct messages", () => {
  describe("in the room's own chat", () => {
    const roomLog = () => within(screen.getByRole("log"));
    const clickMessage = (
      user: ReturnType<typeof setup>["user"],
      name: string,
    ) =>
      user.click(
        roomLog()
          .getAllByRole("button", { name: `Message ${name}` })
          .at(-1)!,
      );
    const recipient = () => screen.getByRole("button", { name: /^Send to:/ });
    const chooseRecipient = async (
      user: ReturnType<typeof setup>["user"],
      name: string,
    ) => {
      await user.click(recipient());
      const drawer = within(await screen.findByRole("dialog"));
      await user.click(drawer.getByRole("button", { name }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    };

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

      await clickMessage(user, "Bob");

      expect(pane("Bob")).toBeNull();
      expect(recipient()).toHaveAccessibleName(/^Send to: Bob/);

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

    it("sends to everybody by default, and to one person when chosen from the slide-out", async () => {
      const { user, server } = await enter();

      expect(recipient()).toHaveAccessibleName(/^Send to: All/);

      await chooseRecipient(user, "Carol");
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

      await chooseRecipient(user, "All");

      expect(
        screen.getByRole("textbox", { name: "Message" }),
      ).toBeInTheDocument();
    });

    it("narrows the people in the slide-out by name, avatar and moderators", async () => {
      const { user } = await enter();
      await user.click(recipient());
      const drawer = within(await screen.findByRole("dialog"));
      const names = () =>
        drawer
          .getAllByRole("button")
          .map((button) =>
            button.textContent?.replace(/[\u2640\u2642\u26a7]/g, ""),
          )
          .filter((name) => ["Bob", "Carol", "Ada Mod"].includes(name ?? ""));

      expect(names()).toEqual(["Bob", "Carol", "Ada Mod"]);

      await user.click(drawer.getByRole("button", { name: "Female" }));
      expect(names()).toEqual(["Carol"]);

      await user.click(drawer.getByRole("button", { name: "Female" }));
      await user.click(drawer.getByRole("button", { name: "Moderator" }));
      expect(names()).toEqual(["Ada Mod"]);

      await user.click(drawer.getByRole("button", { name: "Moderator" }));
      await user.type(drawer.getByRole("searchbox"), "bo");
      expect(names()).toEqual(["Bob"]);

      await user.clear(drawer.getByRole("searchbox"));
      await user.type(drawer.getByRole("searchbox"), "zzz");
      expect(drawer.getByText("Nobody matches.")).toBeInTheDocument();
    });

    it("changes who the guest writes to from the menu on another person's message", async () => {
      const { user, server } = await enter();
      await chooseRecipient(user, "Carol");
      receive(server, dm({ text: "psst" }));

      await clickMessage(user, "Bob");

      expect(recipient()).toHaveAccessibleName(/^Send to: Bob/);
      expect(pane("Bob")).toBeNull();
    });

    it("chooses the person when their message is clicked, without opening a menu", async () => {
      const { user, server } = await enter();
      act(() =>
        server.latest.serverEmit("message:new", message({ text: "hello" })),
      );

      await clickMessage(user, "Bob");

      expect(screen.queryByRole("menu")).toBeNull();
      expect(recipient()).toHaveAccessibleName(/^Send to: Bob/);
    });
    it("makes the chat one tab stop, with the arrow keys moving between every message", async () => {
      const { user, server } = await enter();
      act(() => {
        server.latest.serverEmit(
          "message:new",
          message({
            guestId: ME,
            nickname: "Alice",
            text: "mine",
            sentAt: at(1),
          }),
        );
        server.latest.serverEmit(
          "message:new",
          message({ text: "from Bob", sentAt: at(2) }),
        );
        server.latest.serverEmit(
          "message:new",
          message({
            guestId: carol.guestId,
            nickname: "Carol",
            text: "from Carol",
            sentAt: at(3),
          }),
        );
      });
      const rows = () =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-nav-id]"));

      expect(rows()).toHaveLength(3);
      expect(rows().filter((row) => row.tabIndex === 0)).toEqual([rows()[2]]);

      rows()[2].focus();
      await user.keyboard("{ArrowUp}");
      expect(rows()[1]).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(rows()[0]).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(rows()[0]).toHaveFocus();

      await user.keyboard("{End}");
      expect(rows()[2]).toHaveFocus();

      await user.keyboard("{Home}");
      expect(rows()[0]).toHaveFocus();

      await user.keyboard("{ArrowDown}{Enter}");
      expect(recipient()).toHaveAccessibleName(/^Send to: Bob/);
    });

    it("returns to the newest message when the chat is tabbed back into", async () => {
      const { user, server } = await enter();
      act(() => {
        server.latest.serverEmit(
          "message:new",
          message({ text: "older", sentAt: at(1) }),
        );
        server.latest.serverEmit(
          "message:new",
          message({ text: "newest", sentAt: at(2) }),
        );
      });
      const rows = () =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-nav-id]"));

      rows()[1].focus();
      await user.keyboard("{ArrowUp}");
      expect(rows()[0]).toHaveFocus();

      await user.tab();
      await user.tab({ shift: true });

      expect(rows()[1]).toHaveFocus();
    });

    it("puts the cursor in the message box after choosing somebody with the keyboard", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "psst" }));

      screen
        .getByRole("log")
        .querySelector<HTMLElement>("[data-nav-id]")!
        .focus();
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(
          screen.getByRole("textbox", { name: "Message to Bob" }),
        ).toHaveFocus(),
      );
    });

    it("leaves the cursor alone when somebody was chosen by a tap", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "psst" }));
      document.documentElement.setAttribute("data-pointer", "touch");

      try {
        await clickMessage(user, "Bob");
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(
          screen.getByRole("textbox", { name: "Message to Bob" }),
        ).not.toHaveFocus();
      } finally {
        document.documentElement.removeAttribute("data-pointer");
      }
    });

    it("has a button next to the recipient that goes back to writing to everybody", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "psst" }));

      expect(
        screen.queryByRole("button", { name: /Stop writing privately/ }),
      ).toBeNull();

      await clickMessage(user, "Bob");
      expect(recipient()).toHaveAccessibleName(/^Send to: Bob/);

      await user.click(
        screen.getByRole("button", {
          name: "Stop writing privately to Bob and send to all",
        }),
      );

      expect(recipient()).toHaveAccessibleName(/^Send to: All/);
      expect(
        screen.getByRole("textbox", { name: "Message" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Stop writing privately/ }),
      ).toBeNull();
    });

    it("puts the cursor in the message box when somebody was chosen with the mouse", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "psst" }));
      document.documentElement.setAttribute("data-pointer", "mouse");

      try {
        await clickMessage(user, "Bob");

        await waitFor(() =>
          expect(
            screen.getByRole("textbox", { name: "Message to Bob" }),
          ).toHaveFocus(),
        );
      } finally {
        document.documentElement.removeAttribute("data-pointer");
      }
    });

    it("lets the guest choose a moderator by their message, but not themselves", async () => {
      const { user, server } = await enter();
      act(() => {
        server.latest.serverEmit(
          "message:new",
          message({ guestId: ME, nickname: "Alice", text: "mine" }),
        );
        server.latest.serverEmit(
          "message:new",
          message({
            guestId: ada.guestId,
            nickname: "Ada Mod",
            role: "moderator",
            text: "official",
          }),
        );
      });

      expect(
        roomLog().queryByRole("button", { name: "Message Alice" }),
      ).not.toBeInTheDocument();

      await clickMessage(user, "Ada Mod");

      expect(recipient()).toHaveAccessibleName(/^Send to: Ada Mod/);
    });
  });
});
