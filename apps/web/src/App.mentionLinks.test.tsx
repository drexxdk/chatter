import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { joinRoom, message, setup, stubRooms } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

describe("names mentioned in messages", () => {
  const BOB = { guestId: "guest-bob", nickname: "Bob", avatar: "male" };
  const CAROL = {
    guestId: "guest-carol",
    nickname: "Carol",
    avatar: "female",
    age: 31,
  };

  async function enter() {
    const result = setup(makeFakeServer({ others: [BOB, CAROL] }));
    await joinRoom(result.user);
    await screen.findByRole("button", { name: "Your profile: Alice" });

    return result;
  }

  const said = (
    server: ReturnType<typeof makeFakeServer>,
    text: string,
    from: { guestId: string; nickname: string } = BOB,
  ) =>
    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({ text, guestId: from.guestId, nickname: from.nickname }),
      ),
    );
  const log = () => within(screen.getByRole("log", { name: "General" }));
  const mentions = () =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-mention]"));

  it("sets apart the name of somebody in the room, and shows it without the @", async () => {
    const { server } = await enter();

    said(server, "hi @Carol, hello");

    expect(mentions().map((mention) => mention.textContent)).toEqual(["Carol"]);
    expect(log().getByText(/hello/)).toHaveTextContent("hi Carol, hello");
  });

  it("leaves other @ alone: not in the room, in the middle of a word, or not a name", async () => {
    const { server } = await enter();

    said(server, "hi @Zed, mail carol@Carol.dk and @ nobody");

    expect(mentions()).toEqual([]);
  });

  it("is the same in what the guest wrote", async () => {
    const { server } = await enter();

    said(server, "@Bob", { guestId: "guest-me", nickname: "Alice" });

    expect(mentions().map((mention) => mention.textContent)).toEqual(["Bob"]);
  });

  it("does not set apart somebody who has left the room", async () => {
    const { server } = await enter();
    said(server, "@Carol");
    expect(mentions()).toHaveLength(1);

    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [{ guestId: "guest-me", nickname: "Alice" }, BOB],
      }),
    );

    expect(mentions()).toEqual([]);
    expect(log().getByText("@Carol")).toBeInTheDocument();
  });

  describe("hovered", () => {
    it("says who it is, what they said they are and how old", async () => {
      const { user, server } = await enter();
      said(server, "hi @Carol");

      await user.hover(mentions()[0]);

      const card = screen.getByRole("tooltip");
      expect(card).toHaveTextContent("Carol");
      expect(card).toHaveTextContent("Female");
      expect(card).toHaveTextContent("31 years old");
      expect(mentions()[0]).toHaveAttribute("aria-describedby", card.id);
    });

    it("leaves out the age when they did not say", async () => {
      const { user, server } = await enter();
      said(server, "hi @Bob", { guestId: "guest-carol", nickname: "Carol" });

      await user.hover(mentions()[0]);

      const card = screen.getByRole("tooltip");
      expect(card).toHaveTextContent("Bob");
      expect(card).toHaveTextContent("Male");
      expect(card).not.toHaveTextContent("years");
    });

    it("is gone when the pointer leaves", async () => {
      const { user, server } = await enter();
      said(server, "hi @Carol");

      await user.hover(mentions()[0]);
      await user.unhover(mentions()[0]);

      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(mentions()[0]).not.toHaveAttribute("aria-describedby");
    });

    it("works for the guest's own name too", async () => {
      const { user, server } = await enter();
      said(server, "hello @Alice");

      await user.hover(mentions()[0]);

      expect(screen.getByRole("tooltip")).toHaveTextContent("Alice");
    });
  });

  describe("clicked", () => {
    it("chooses the person to write to, as their name does", async () => {
      const { user, server } = await enter();
      said(server, "hi @Carol");

      await user.click(mentions()[0]);

      expect(
        await screen.findByRole("textbox", { name: "Message to Carol" }),
      ).toHaveFocus();
    });

    it("does nothing for the guest's own name", async () => {
      const { user, server } = await enter();
      said(server, "hello @Alice");

      expect(mentions()[0].tagName).toBe("SPAN");
      await user.click(mentions()[0]);

      expect(screen.queryByRole("textbox", { name: /^Message to/ })).toBeNull();
    });

    it("does nothing for somebody who has blocked the guest", async () => {
      const { server } = await enter();
      said(server, "hi @Carol");
      act(() =>
        server.latest.serverEmit("dm:blocked", {
          guestId: "guest-carol",
          nickname: "Carol",
          role: "guest",
          avatar: "female",
        }),
      );

      // Set apart all the same, but not something to click.
      expect(mentions()[0].tagName).toBe("SPAN");
    });

    it("is not a stop for the Tab key, which the messages have their own way of", async () => {
      const { server } = await enter();
      said(server, "hi @Carol");

      expect(mentions()[0]).toHaveAttribute("tabindex", "-1");
    });
  });
});
