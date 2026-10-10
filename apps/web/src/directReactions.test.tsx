import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { stubRooms } from "./test/app";
import {
  ME,
  bob,
  carol,
  dm,
  enter,
  fromMe,
  log,
  people,
  receive,
  type Server,
} from "./test/direct";

beforeEach(() => {
  stubRooms();
});

const row = (text: string) =>
  within(screen.getByText(text).closest("li") as HTMLElement);

const reaction = (
  server: Server,
  messageId: string,
  by: { guestId: string; nickname: string },
  to: { guestId: string },
  extra: Record<string, unknown> = {},
) =>
  act(() =>
    server.latest.serverEmit("dm:reaction", {
      messageId,
      emoji: "👍",
      on: true,
      byGuestId: by.guestId,
      byNickname: by.nickname,
      toGuestId: to.guestId,
      ...extra,
    }),
  );

const ALICE = { guestId: ME, nickname: "Alice" };

describe("reacting to a private message", () => {
  it("offers the same bar as in the room, and tells the server who it is for", async () => {
    const { user, server } = await enter();
    receive(server, dm({ id: "d1", text: "hi Alice" }));

    for (const emoji of ["👍", "❤️", "😆", "😮"]) {
      expect(
        row("hi Alice").getByRole("button", { name: `React with ${emoji}` }),
      ).toBeInTheDocument();
    }
    expect(
      row("hi Alice").getAllByRole("button", { name: "Add reaction" }),
    ).not.toHaveLength(0);

    await user.click(
      row("hi Alice").getByRole("button", { name: "React with ❤️" }),
    );

    expect(server.latest.emittedEvents("dm:react")).toEqual([
      { toGuestId: bob.guestId, messageId: "d1", emoji: "❤️", on: true },
    ]);
  });

  it("keeps the options for the person next to it", async () => {
    const { server } = await enter();
    receive(server, dm({ text: "hi Alice" }));

    expect(
      row("hi Alice").getByRole("button", { name: /^Actions for Bob/ }),
    ).toBeInTheDocument();
  });

  it("shows a reaction when the server passes it on, and takes it back with the next click", async () => {
    const { user, server } = await enter();
    receive(server, dm({ id: "d1", text: "hi Alice" }));

    reaction(server, "d1", ALICE, bob);

    const chip = row("hi Alice").getByRole("button", { name: /^👍 1/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await user.click(chip);

    expect(server.latest.emittedEvents("dm:react")).toEqual([
      { toGuestId: bob.guestId, messageId: "d1", emoji: "👍", on: false },
    ]);

    reaction(server, "d1", ALICE, bob, { on: false });

    expect(row("hi Alice").queryByRole("button", { name: /^👍/ })).toBeNull();
  });

  it("does not offer reacting to the guest's own message, but shows what the other person gave it", async () => {
    const { server } = await enter();
    receive(server, { ...fromMe(bob, "hi back"), id: "own" });

    reaction(server, "own", bob, ALICE);

    const mine = row("hi back");
    expect(mine.queryByRole("button", { name: /^React with/ })).toBeNull();
    expect(mine.getByRole("img", { name: "👍 1: Bob" })).toBeInTheDocument();
  });

  it.each([
    ["a message that is not known", "nope", ALICE, bob],
    ["somebody who is not in the conversation", "d1", carol, ALICE],
    ["the author of the message itself", "d1", bob, ALICE],
  ])("ignores a reaction from %s", async (_label, messageId, by, to) => {
    const { server } = await enter();
    receive(server, dm({ id: "d1", text: "hi Alice" }));

    reaction(server, messageId, by, to);

    expect(row("hi Alice").queryByRole("button", { name: /^👍/ })).toBeNull();
    expect(row("hi Alice").queryByRole("img", { name: /^👍/ })).toBeNull();
  });

  it("is shown in the conversation as well, where it can be added to", async () => {
    const { user, server } = await enter();
    receive(server, dm({ id: "d1", text: "hi Alice" }));
    reaction(server, "d1", ALICE, bob);

    await user.click(people().getByRole("button", { name: "Bob" }));

    expect(
      within(
        log("Bob").getByText("hi Alice").closest("li") as HTMLElement,
      ).getByRole("button", { name: /^👍 1/ }),
    ).toBeInTheDocument();

    await user.click(
      within(
        log("Bob").getByText("hi Alice").closest("li") as HTMLElement,
      ).getByRole("button", { name: "React with ❤️" }),
    );

    expect(server.latest.emittedEvents("dm:react")).toEqual([
      { toGuestId: bob.guestId, messageId: "d1", emoji: "❤️", on: true },
    ]);
  });

  it("says why when the server refuses", async () => {
    const { user, server } = await enter();
    receive(server, dm({ id: "d1", text: "hi Alice" }));
    server.latest.acks["dm:react"] = () => ({
      ok: false,
      error: "user_not_found",
    });

    await user.click(
      row("hi Alice").getByRole("button", { name: "React with ❤️" }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
