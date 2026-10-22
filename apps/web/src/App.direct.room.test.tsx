import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { focusMessageBox } from "./focusMessageBox";
import { stubRooms, setup, at, message } from "./test/app";
import {
  ME,
  bob,
  carol,
  ada,
  dm,
  fromMe,
  enter,
  present,
  receive,
  pane,
} from "./test/direct";

beforeEach(() => {
  stubRooms();
});

describe("direct messages", () => {
  it("focuses the people search and returns focus on Escape", async () => {
    const { user } = await enter();
    const toggle = screen.getByRole("button", {
      name: "People and direct messages",
    });
    await user.click(toggle);
    const panel = screen.getByRole("region", {
      name: "People and direct messages",
    });
    await waitFor(() =>
      expect(
        within(panel).getByRole("searchbox", { name: "Search people" }),
      ).toHaveFocus(),
    );
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "People and direct messages" }),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the people panel on an outside click but keeps it open for inside clicks", async () => {
    const { user } = await enter();
    const toggle = screen.getByRole("button", {
      name: "People and direct messages",
    });
    await user.click(toggle);
    const panel = screen.getByRole("region", {
      name: "People and direct messages",
    });
    await user.click(
      within(panel).getByRole("searchbox", { name: "Search people" }),
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("textbox", { name: "Message" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: "People and direct messages" }),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  describe("in the room's own chat", () => {
    const roomLog = () => within(screen.getByRole("log"));
    const clickMessage = (
      user: ReturnType<typeof setup>["user"],
      name: string,
    ) => {
      // The name above the message, which on a private message says who it is to or from.
      const names = Array.from(
        screen
          .getByRole("log")
          .querySelectorAll<HTMLElement>('span[class*="hover:underline"]'),
      ).filter((element) => element.textContent?.endsWith(name));

      return user.click(names.at(-1)!);
    };
    // Who the box writes to is shown above it; people are chosen in the panel.
    const writingTo = (name?: string) =>
      name
        ? screen.queryByText(`Private: ${name}`)
        : screen.queryByText(/^Private: /);
    const chooseRecipient = (
      user: ReturnType<typeof setup>["user"],
      name: string,
    ) =>
      user.click(
        within(
          screen.getByRole("list", { name: "People in this room" }),
        ).getByRole("button", { name: new RegExp(`^${name}`) }),
      );

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
      expect(writingTo("Bob")).toBeInTheDocument();

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

    it("opens the private conversation from the compact composer destination", async () => {
      const { user } = await enter();
      await chooseRecipient(user, "Bob");
      const destination = screen.getByText("Private: Bob");
      const form = destination.closest("form[data-composer]");
      expect(form).not.toBeNull();
      const controls = within(form as HTMLFormElement);
      expect(
        controls.getByRole("button", { name: "Stop writing privately" }),
      ).toBeVisible();
      await user.click(
        controls.getByRole("button", {
          name: "Open private chat",
        }),
      );
      expect(pane("Bob")).toBeInTheDocument();
    });

    it("sends to everybody by default, and to one person when chosen from the slide-out", async () => {
      const { user, server } = await enter();

      expect(writingTo()).toBeNull();
      expect(screen.getByText("Room")).toBeInTheDocument();
      const peopleButton = screen.getByRole("button", {
        name: "People and direct messages",
      });
      expect(peopleButton).toHaveTextContent("");
      expect(peopleButton).toHaveAttribute(
        "title",
        "People and direct messages",
      );

      await chooseRecipient(user, "Carol");
      expect(writingTo("Carol")).toBeInTheDocument();
      expect(screen.queryByText("Room")).toBeNull();
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

      await chooseRecipient(user, "Carol");

      expect(screen.getByText("Room")).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message" }),
      ).toBeInTheDocument();
    });

    it("narrows the people in the panel by name, avatar and moderators", async () => {
      const { user } = await enter();
      const panel = within(
        screen.getByRole("complementary", {
          name: "People and direct messages",
        }),
      );
      const names = () =>
        panel
          .getAllByRole("button")
          .map((button) => button.textContent)
          .filter((name) => ["Bob", "Carol", "Ada Mod"].includes(name ?? ""));

      expect(names()).toEqual(["Bob", "Carol", "Ada Mod"]);

      expect(panel.getByRole("button", { name: "Male" })).toHaveTextContent(
        "1",
      );
      expect(panel.getByRole("button", { name: "Female" })).toHaveTextContent(
        "1",
      );
      expect(
        panel.getByRole("button", { name: "Not specified" }),
      ).toHaveTextContent("1");
      expect(
        panel.getByRole("button", { name: "Moderator" }),
      ).toHaveAccessibleDescription("1");
      const transgender = panel.getByRole("button", { name: "Transgender" });
      expect(transgender).toBeDisabled();
      expect(transgender).toHaveTextContent("");
      await user.click(transgender);
      expect(transgender).toHaveAttribute("aria-pressed", "false");
      expect(names()).toEqual(["Bob", "Carol", "Ada Mod"]);

      await user.click(panel.getByRole("button", { name: "Not specified" }));
      expect(names()).toEqual([]);
      await user.click(panel.getByRole("button", { name: "Moderator" }));
      expect(names()).toEqual(["Ada Mod"]);
      await user.click(panel.getByRole("button", { name: "Not specified" }));
      await user.click(panel.getByRole("button", { name: "Moderator" }));

      await user.click(panel.getByRole("button", { name: "Female" }));
      expect(names()).toEqual(["Carol"]);
      await user.click(panel.getByRole("button", { name: "Moderator" }));
      expect(names()).toEqual(["Carol", "Ada Mod"]);
      await user.click(panel.getByRole("button", { name: "Moderator" }));
      expect(panel.getByRole("button", { name: "Male" })).toHaveTextContent(
        "1",
      );

      await user.click(panel.getByRole("button", { name: "Female" }));
      await user.click(panel.getByRole("button", { name: "Moderator" }));
      expect(names()).toEqual(["Ada Mod"]);

      await user.click(panel.getByRole("button", { name: "Moderator" }));
      await user.type(panel.getByRole("searchbox"), "bo");
      expect(names()).toEqual(["Bob"]);
      expect(panel.getByRole("button", { name: "Female" })).toHaveTextContent(
        "1",
      );

      await user.clear(panel.getByRole("searchbox"));
      await user.type(panel.getByRole("searchbox"), "zzz");
      expect(panel.getAllByText("Nobody matches.")).not.toHaveLength(0);
    });

    it("updates counts and clears unavailable gender and moderator filters as people leave", async () => {
      const { user, server } = await enter([carol]);
      const panel = within(
        screen.getByRole("complementary", {
          name: "People and direct messages",
        }),
      );
      const male = panel.getByRole("button", { name: "Male" });
      const female = panel.getByRole("button", { name: "Female" });
      expect(panel.queryByRole("button", { name: "Moderator" })).toBeNull();
      expect(male).toBeDisabled();
      expect(male).toHaveTextContent("");
      expect(female).toBeEnabled();
      expect(female).toHaveAccessibleDescription("1");

      present(server, [
        bob,
        carol,
        { ...carol, guestId: "guest-carol-2", nickname: "Carol 2" },
      ]);
      expect(male).toBeEnabled();
      expect(male).toHaveTextContent("1");
      expect(female).toHaveTextContent("2");
      await user.click(female);
      expect(female).toHaveAttribute("aria-pressed", "true");

      present(server, [ada]);
      expect(female).toBeDisabled();
      expect(female).toHaveTextContent("");
      expect(female).not.toHaveAttribute("aria-describedby");
      expect(female).toHaveAttribute("aria-pressed", "false");
      expect(
        panel.getByRole("button", { name: /^Ada Mod/ }),
      ).toBeInTheDocument();
      await user.click(panel.getByRole("button", { name: "Moderator" }));

      present(server, [bob]);
      expect(panel.queryByRole("button", { name: "Moderator" })).toBeNull();
      expect(panel.getByRole("button", { name: /^Bob/ })).toBeInTheDocument();
      present(server, [ada]);
      expect(panel.getByRole("button", { name: "Moderator" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("changes who the guest writes to from the menu on another person's message", async () => {
      const { user, server } = await enter();
      await chooseRecipient(user, "Carol");
      receive(server, dm({ text: "psst" }));

      await clickMessage(user, "Bob");

      expect(writingTo("Bob")).toBeInTheDocument();
      expect(pane("Bob")).toBeNull();
    });

    it("chooses the person when their name is clicked, without opening a menu", async () => {
      const { user, server } = await enter();
      act(() =>
        server.latest.serverEmit("message:new", message({ text: "hello" })),
      );

      await clickMessage(user, "Bob");

      expect(screen.queryByRole("menu")).toBeNull();
      expect(writingTo("Bob")).toBeInTheDocument();
    });
    it("does not carry pending editor focus into a new page", async () => {
      const previous = await enter();
      let pendingFocus: FrameRequestCallback | undefined;
      const frame = vi
        .spyOn(globalThis, "requestAnimationFrame")
        .mockImplementationOnce((callback) => {
          pendingFocus = callback;
          return 0;
        });
      try {
        focusMessageBox();
      } finally {
        frame.mockRestore();
      }
      expect(pendingFocus).toBeDefined();
      previous.unmount();

      const { server } = setup();
      await screen.findByRole("log", { name: "General" });
      await screen.findByRole("textbox", { name: "Message" });
      act(() =>
        server.latest.serverEmit("message:new", message({ text: "new page" })),
      );
      const row = screen
        .getByText("new page")
        .closest<HTMLElement>("[data-nav-id]")!;
      act(() => row.focus());
      act(() => pendingFocus?.(performance.now()));
      expect(row).toHaveFocus();
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

      await user.keyboard("{ArrowDown}{Enter} ");
      expect(writingTo()).toBeNull();
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
      await user.keyboard("{ContextMenu}");
      await user.keyboard("{ArrowDown}{Enter}");

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
      expect(writingTo("Bob")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", {
          name: "Stop writing privately",
        }),
      );

      expect(writingTo()).toBeNull();
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

      // Nothing of the guest's own is a name to click.
      expect(roomLog().queryByText("Alice")).toBeNull();

      await clickMessage(user, "Ada Mod");

      expect(writingTo("Ada Mod")).toBeInTheDocument();
    });
  });
});
