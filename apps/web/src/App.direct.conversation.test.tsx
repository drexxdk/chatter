import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { stubRooms } from "./test/app";
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
  receive,
  pane,
  log,
} from "./test/direct";

beforeEach(() => {
  stubRooms();
});

describe("direct messages", () => {
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

      await user.click(threads().getByRole("button", { name: /^Bob/ }));

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

    it("puts the cursor in the room's message box when going back, except after a tap", async () => {
      const { user } = await enter();
      const back = () =>
        user.click(screen.getByRole("button", { name: "Back to the room" }));

      await user.click(people().getByRole("button", { name: "Bob" }));
      await back();
      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus(),
      );

      await user.click(people().getByRole("button", { name: "Bob" }));
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
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
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
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(log("Bob").queryByText("something nasty")).not.toBeInTheDocument();
      expect(log("Bob").getByText("This user was banned")).toBeInTheDocument();
      // What the guest wrote is theirs to keep.
      expect(log("Bob").getByText("stop that")).toBeInTheDocument();
    });
  });
});
