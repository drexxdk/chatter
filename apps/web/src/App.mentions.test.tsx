import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { joinRoom, setup, stubRooms } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

describe("mentioning somebody with @", () => {
  const BOB = { guestId: "guest-bob", nickname: "Bob", avatar: "male" };
  const BOBBY = { guestId: "guest-bobby", nickname: "Bobby" };
  const ANNE = { guestId: "guest-anne", nickname: "Anne Linde" };
  const CAROL = { guestId: "guest-carol", nickname: "Carol" };

  async function enter(others = [BOB, BOBBY, ANNE, CAROL]) {
    const result = setup(makeFakeServer({ others }));
    await joinRoom(result.user);
    await screen.findByRole("button", { name: "Your profile: Alice" });

    return { ...result, box: screen.getByRole("textbox", { name: "Message" }) };
  }

  const list = () =>
    screen.queryByRole("listbox", { name: "People to mention" });
  const names = () =>
    within(list()!)
      .getAllByRole("option")
      .map((option) => option.textContent);
  const highlighted = () =>
    within(list()!)
      .getAllByRole("option")
      .find((option) => option.getAttribute("aria-selected") === "true")
      ?.textContent;

  it("brings up everybody else in the room for an @ that begins the message", async () => {
    const { user, box } = await enter();

    await user.type(box, "@");

    expect(names()).toEqual(["Bob", "Bobby", "Anne Linde", "Carol"]);
  });

  it("does not offer the guest themselves", async () => {
    const { user, box } = await enter();

    await user.type(box, "@");

    expect(names()).not.toContain("Alice");
  });

  it("narrows the list as the name is written, and goes away when nobody matches", async () => {
    const { user, box } = await enter();

    await user.type(box, "@bo");
    expect(names()).toEqual(["Bob", "Bobby"]);

    await user.type(box, "bb");
    expect(names()).toEqual(["Bobby"]);

    await user.type(box, "x");
    expect(list()).toBeNull();
  });

  it("comes after a space and after a line break", async () => {
    const { user, box } = await enter();

    await user.type(box, "hello @");
    expect(list()).not.toBeNull();

    await user.clear(box);
    await user.type(box, "hello{Shift>}{Enter}{/Shift}@ca");
    expect(names()).toEqual(["Carol"]);
  });

  it("does not come in the middle of a word, so an email address is left alone", async () => {
    const { user, box } = await enter();

    await user.type(box, "write to ann@");
    expect(list()).toBeNull();

    await user.type(box, "example.com");
    expect(list()).toBeNull();
  });

  it("is not there without an @", async () => {
    const { user, box } = await enter();

    await user.type(box, "hello");

    expect(list()).toBeNull();
  });

  it("puts the chosen name in place of what was written, with a space after it", async () => {
    const { user, box } = await enter();
    await user.type(box, "hi @bo");

    await user.click(within(list()!).getByRole("option", { name: "Bobby" }));

    expect(box).toHaveValue("hi @Bobby ");
    expect(list()).toBeNull();
    expect(box).toHaveFocus();
  });

  it("keeps what follows the cursor", async () => {
    const { user, box } = await enter();
    await user.type(box, "hi @ca there");
    await user.keyboard("{ArrowLeft>6/}");

    await user.click(within(list()!).getByRole("option", { name: "Carol" }));

    expect(box).toHaveValue("hi @Carol  there");
  });

  it("takes a name with a space in it whole", async () => {
    const { user, box } = await enter();
    await user.type(box, "@Anne L");

    expect(names()).toEqual(["Anne Linde"]);
    await user.keyboard("{Enter}");

    expect(box).toHaveValue("@Anne Linde ");
  });

  it("does not come back for a name that is already written", async () => {
    const { user, box } = await enter();

    await user.type(box, "@Carol ");

    expect(list()).toBeNull();
  });

  describe("with the keyboard", () => {
    it("highlights the first, and the arrow keys move around, from the last to the first and back", async () => {
      const { user, box } = await enter();
      await user.type(box, "@");
      expect(highlighted()).toBe("Bob");

      await user.keyboard("{ArrowDown}");
      expect(highlighted()).toBe("Bobby");

      await user.keyboard("{ArrowUp}{ArrowUp}");
      expect(highlighted()).toBe("Carol");

      await user.keyboard("{ArrowDown}");
      expect(highlighted()).toBe("Bob");
    });

    it("chooses the highlighted one with Enter, which does not send the message", async () => {
      const { user, server, box } = await enter();
      await user.type(box, "hi @");
      await user.keyboard("{ArrowDown}{Enter}");

      expect(box).toHaveValue("hi @Bobby ");
      expect(server.latest.emittedEvents("message:send")).toEqual([]);
    });

    it("chooses with Tab as well, and leaves the box in focus", async () => {
      const { user, box } = await enter();
      await user.type(box, "@ca");

      await user.keyboard("{Tab}");

      expect(box).toHaveValue("@Carol ");
      expect(box).toHaveFocus();
    });

    it("closes the list with Escape and keeps the box, until another @ is written", async () => {
      const { user, box } = await enter();
      await user.type(box, "@bo");

      await user.keyboard("{Escape}");

      expect(list()).toBeNull();
      expect(box).toHaveFocus();

      await user.type(box, "b");
      expect(list()).toBeNull();

      await user.type(box, " and @");
      expect(list()).not.toBeNull();
    });

    it("sends with Enter when there is no list", async () => {
      const { user, server, box } = await enter();
      await user.type(box, "hi @zzz");

      await user.keyboard("{Enter}");

      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: "hi @zzz" },
      ]);
    });

    it("starts a new line with Shift+Enter even with the list open", async () => {
      const { user, box } = await enter();
      await user.type(box, "@bo");

      await user.keyboard("{Shift>}{Enter}{/Shift}");

      expect(box).toHaveValue("@bo\n");
    });
  });

  it("points at the highlighted name for assistive technology, while the box stays a text box", async () => {
    const { user, box } = await enter();
    await user.type(box, "@");

    expect(box).toHaveAttribute("aria-controls", list()!.id);
    expect(box.getAttribute("aria-activedescendant")).toBe(
      within(list()!).getAllByRole("option")[0].id,
    );

    await user.keyboard("{Escape}");

    expect(box).not.toHaveAttribute("aria-controls");
    expect(box).not.toHaveAttribute("aria-activedescendant");
  });

  it("goes when the box loses the focus", async () => {
    const { user, box } = await enter();
    await user.type(box, "@");

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(list()).toBeNull();
  });

  it("follows who is in the room", async () => {
    const { user, server, box } = await enter();
    await user.type(box, "@");
    expect(names()).toContain("Carol");

    const { act } = await import("@testing-library/react");
    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [{ guestId: "guest-me", nickname: "Alice" }, BOB, BOBBY, ANNE],
      }),
    );

    expect(names()).not.toContain("Carol");
  });

  it("is not offered when the room is empty of others", async () => {
    const { user, box } = await enter([]);

    await user.type(box, "@");

    expect(list()).toBeNull();
  });
});
