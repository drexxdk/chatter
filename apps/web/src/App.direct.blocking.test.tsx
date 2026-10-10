import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { stubRooms, setup, joinRoom, message } from "./test/app";
import {
  bob,
  carol,
  ada,
  dm,
  present,
  enter,
  people,
  threads,
  receive,
  pane,
  log,
} from "./test/direct";
import { makeFakeServer } from "./test/fakeSocket";
import type { Server } from "./test/direct";

beforeEach(() => {
  stubRooms();
});

describe("direct messages", () => {
  describe("blocking", () => {
    it("blocks the person, says so, and can undo it", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      await user.click(screen.getByRole("button", { name: "Block Bob" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:block")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
      expect(
        (await screen.findAllByRole("button", { name: "Unblock Bob" })).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        screen.getByText(
          "You blocked Bob. Their messages no longer reach you, and you can't write to them until you unblock them.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Block Bob" })).toBeNull();

      await user.click(
        screen.getAllByRole("button", { name: "Unblock Bob" })[0],
      );

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:unblock")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
      expect(
        await screen.findByRole("button", { name: "Block Bob" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeEnabled();
    });

    it("stops saying that a blocked person leaves or joins the room, and starts again once unblocked", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findAllByRole("button", { name: "Unblock Bob" });

      present(server, [carol, ada]);
      present(server, [bob, carol, ada]);
      present(server, [carol, ada]);

      expect(
        screen.queryByText(/Bob (left|rejoined|joined) the room/),
      ).toBeNull();

      await user.click(
        screen.getAllByRole("button", { name: "Unblock Bob" })[0],
      );
      await screen.findByRole("button", { name: "Block Bob" });
      present(server, [bob, carol, ada]);

      expect(
        screen.getAllByText(/Bob (rejoined|joined) the room/).length,
      ).toBeGreaterThan(0);
    });

    it("says nothing about somebody blocking the guest back, when the guest has blocked them", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findAllByRole("button", { name: "Unblock Bob" });

      act(() =>
        server.latest.serverEmit("dm:blocked", {
          guestId: bob.guestId,
          nickname: "Bob",
          role: "guest",
          avatar: "male",
        }),
      );

      expect(screen.queryByText(/has blocked you/)).toBeNull();
      expect(screen.queryByText(/Blocked you/)).toBeNull();
    });

    describe("when somebody has blocked the guest", () => {
      const youWereBlocked = (server: Server) =>
        act(() =>
          server.latest.serverEmit("dm:blocked", {
            guestId: bob.guestId,
            nickname: "Bob",
            role: "guest",
            avatar: "male",
          }),
        );

      it("says so in the room and in the conversation, and marks and greys out the person", async () => {
        const { user, server } = await enter();

        youWereBlocked(server);

        expect(screen.getByRole("log").textContent).toContain(
          "Bob has blocked you. Your messages no longer reach them.",
        );
        expect(people().getByRole("button", { name: /^Bob/ })).toBeDisabled();
        expect(
          people().getByRole("button", { name: /^Bob/ }),
        ).toHaveAccessibleName(/Blocked you/);
        expect(
          threads().getByRole("button", { name: /^Bob/ }),
        ).toHaveAccessibleName(/Blocked you/);

        await user.click(threads().getByRole("button", { name: /^Bob/ }));

        expect(
          log("Bob").getByText(
            "Bob has blocked you. Your messages no longer reach them.",
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("textbox", { name: "Message to Bob" }),
        ).toBeDisabled();
        expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
        expect(
          screen.getByText("Bob has blocked you, so you can't write to them."),
        ).toBeInTheDocument();
      });

      it("cannot be chosen to write to, in the slide-out or by clicking their message", async () => {
        const { user, server } = await enter();
        act(() =>
          server.latest.serverEmit("message:new", message({ text: "hello" })),
        );
        youWereBlocked(server);

        await user.click(screen.getByRole("button", { name: /^Send to:/ }));
        const drawer = within(await screen.findByRole("dialog"));
        const row = drawer
          .getAllByRole("button", { name: /^Bob/ })
          .find((button) => button.textContent?.includes("Blocked you"));
        expect(row).toBeDisabled();
        await user.keyboard("{Escape}");
        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );

        expect(
          within(screen.getByRole("log"))
            .getAllByRole("button", { name: "Message Bob" })
            .at(-1),
        ).toHaveAttribute("aria-disabled", "true");
      });

      it("is undone, and says so, when they unblock the guest", async () => {
        const { user, server } = await enter();
        youWereBlocked(server);

        act(() =>
          server.latest.serverEmit("dm:unblocked", {
            guestId: bob.guestId,
            nickname: "Bob",
            role: "guest",
            avatar: "male",
          }),
        );

        expect(screen.getByRole("log").textContent).toContain(
          "Bob has unblocked you.",
        );
        expect(people().getByRole("button", { name: /^Bob/ })).toBeEnabled();

        await user.click(threads().getByRole("button", { name: /^Bob/ }));

        expect(
          screen.getByRole("textbox", { name: "Message to Bob" }),
        ).toBeEnabled();
      });

      it("learns it from the server's refusal as well, and shows the person as having blocked the guest", async () => {
        const { user, server } = await enter();
        server.latest.acks["dm:send"] = () => ({
          ok: false,
          error: "blocked_by_recipient",
        });
        await user.click(people().getByRole("button", { name: "Bob" }));

        await user.type(
          screen.getByRole("textbox", { name: "Message to Bob" }),
          "hello",
        );
        await user.click(screen.getByRole("button", { name: "Send" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
          "This person has blocked you, so your message could not be sent.",
        );
        await waitFor(() =>
          expect(
            screen.getByRole("textbox", { name: "Message to Bob" }),
          ).toBeDisabled(),
        );
        expect(
          log("Bob").getByText(
            "Bob has blocked you. Your messages no longer reach them.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("has the unblock button next to the text box only while the person is blocked", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(document.getElementById("unblock-direct")).toBeNull();
      expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Block Bob" }));

      const button = await waitFor(() => {
        const found = document.getElementById("unblock-direct");
        expect(found).not.toBeNull();
        return found as HTMLElement;
      });
      expect(button).toHaveAccessibleName("Unblock Bob");
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeDisabled();

      await user.click(button);

      await waitFor(() =>
        expect(document.getElementById("unblock-direct")).toBeNull(),
      );
    });

    it("puts the cursor on the unblock button when a blocked chat is opened with the keyboard, and back in the box once unblocked", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await waitFor(() =>
        expect(document.getElementById("unblock-direct")).not.toBeNull(),
      );
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );
      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus(),
      );

      threads().getByRole("button", { name: /^Bob/ }).focus();
      await user.keyboard("{Enter}");

      await waitFor(
        () => expect(document.getElementById("unblock-direct")).toHaveFocus(),
        { timeout: 5000 },
      );

      await user.keyboard("{Enter}");

      await waitFor(
        () =>
          expect(
            screen.getByRole("textbox", { name: "Message to Bob" }),
          ).toHaveFocus(),
        { timeout: 5000 },
      );
    }, 30_000);

    it("marks who is blocked in the lists and in the chat, and does not let them be written to", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      act(() =>
        server.latest.serverEmit("message:new", message({ text: "hello" })),
      );
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findAllByRole("button", { name: "Unblock Bob" });
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      expect(
        people().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/Blocked/);
      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/Blocked/);
      expect(
        within(screen.getByRole("log")).getAllByText("Blocked").length,
      ).toBeGreaterThanOrEqual(1);

      expect(
        within(screen.getByRole("log"))
          .getAllByRole("button", { name: "Message Bob" })
          .at(-1),
      ).toHaveAttribute("aria-disabled", "true");

      await user.click(screen.getByRole("button", { name: /^Send to:/ }));
      const drawer = within(await screen.findByRole("dialog"));
      const blockedRow = drawer
        .getAllByRole("button", { name: /^Bob/ })
        .find((button) => button.textContent?.includes("Blocked"));
      expect(blockedRow).toBeDisabled();
    });

    it("can be unblocked from the conversation list", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findAllByRole("button", { name: "Unblock Bob" });
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      await user.click(threads().getByRole("button", { name: "Unblock Bob" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:unblock")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/Blocked/);
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
      await screen.findAllByRole("button", { name: "Unblock Bob" });
      await user.click(
        screen.getByRole("button", { name: "Back to the room" }),
      );

      await user.click(people().getByRole("button", { name: /^Bob/ }));

      expect(
        screen.getAllByRole("button", { name: "Unblock Bob" }).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("tells a new connection who was blocked, since the server forgets", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [0]);
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      present(server, [bob]);
      await user.click(people().getByRole("button", { name: "Bob" }));
      await user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findAllByRole("button", { name: "Unblock Bob" });

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
});
