import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";
import { saveShowMovements } from "./preferences";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const BOB = { guestId: "guest-bob", nickname: "Bob" };
const CAROL = { guestId: "guest-carol", nickname: "Carol" };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ROOMS })),
  );
});

async function enter() {
  const server = makeFakeServer({ others: [BOB, CAROL] });
  const user = userEvent.setup();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("log", { name: "General" });

  return { user, server };
}

let n = 0;
const said = (
  from: { guestId: string; nickname: string },
  text: string,
  second: number,
) => ({
  id: `m${++n}`,
  roomSlug: "general",
  guestId: from.guestId,
  nickname: from.nickname,
  text,
  sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, second)).toISOString(),
});

const emit = (
  server: ReturnType<typeof makeFakeServer>,
  ...messages: object[]
) =>
  act(() => {
    for (const message of messages) {
      server.latest.serverEmit("message:new", message);
    }
  });

// The guest's own arrival is the first line of every room, which these tests are not about.
const rows = () =>
  within(screen.getByRole("log"))
    .getAllByRole("listitem")
    .filter((row) => !row.textContent?.startsWith("You joined the room."));

describe("messages by the same person", () => {
  it("are shown together under one name, with the time of the last", async () => {
    const { server } = await enter();

    emit(
      server,
      said(BOB, "first", 1),
      said(BOB, "second", 2),
      said(BOB, "third", 9),
    );

    expect(rows()).toHaveLength(1);
    const row = within(rows()[0]);
    expect(row.getAllByText("Bob")).toHaveLength(1);
    expect(row.getByText("first")).toBeInTheDocument();
    expect(row.getByText("second")).toBeInTheDocument();
    expect(row.getByText("third")).toBeInTheDocument();
    expect(rows()[0].querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-03T12:00:09.000Z",
    );
    expect(rows()[0].querySelectorAll("time")).toHaveLength(1);
  });

  it("start a new group when somebody else has written in between", async () => {
    const { server } = await enter();

    emit(
      server,
      said(BOB, "one", 1),
      said(CAROL, "two", 2),
      said(BOB, "three", 3),
    );

    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("one"),
      expect.stringContaining("two"),
      expect.stringContaining("three"),
    ]);
  });

  it("start a new group when something happened in between, such as somebody coming in", async () => {
    saveShowMovements(true);
    const { server } = await enter();
    emit(server, said(BOB, "before", 1));

    act(() =>
      server.latest.serverEmit("room:event", {
        id: "dan-in",
        roomSlug: "general",
        event: "joined",
        guestId: "guest-dan",
        nickname: "Dan",
        sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, 3)).toISOString(),
      }),
    );
    emit(server, said(BOB, "after", 5));

    expect(rows()).toHaveLength(3);
    expect(rows()[1]).toHaveAttribute("data-kind", "status");
  });

  it("are grouped on the guest's own side too, without a name that is not theirs", async () => {
    const { server } = await enter();

    emit(
      server,
      said({ guestId: "guest-me", nickname: "Alice" }, "mine one", 1),
      said({ guestId: "guest-me", nickname: "Alice" }, "mine two", 2),
    );

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("data-side", "right");
  });

  it("are still one stop each for the arrow keys", async () => {
    const { user, server } = await enter();
    emit(server, said(BOB, "one", 1), said(BOB, "two", 2));
    const stops = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-nav-id]"));

    expect(stops()).toHaveLength(2);

    stops()[1].focus();
    await user.keyboard("{ArrowUp}");

    expect(stops()[0]).toHaveFocus();
  });
});

describe("choosing the person to write to", () => {
  it("is done with their name, whichever of their messages is shown, and opens no menu", async () => {
    const { user, server } = await enter();
    emit(server, said(BOB, "one", 1), said(BOB, "two", 2));

    await user.click(within(rows()[0]).getByText("Bob"));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Private: Bob")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Message to Bob" }),
      ).toBeInTheDocument(),
    );
  });

  it("has nothing to click on the guest's own messages", async () => {
    const { server } = await enter();

    emit(server, said({ guestId: "guest-me", nickname: "Alice" }, "mine", 1));

    expect(within(rows()[0]).queryByText("Alice")).toBeNull();
  });

  it("is not done by the keyboard from the message itself", async () => {
    const { user, server } = await enter();
    emit(server, said(BOB, "one", 1));

    within(rows()[0])
      .getByText("one")
      .closest<HTMLElement>("[data-nav-id]")!
      .focus();
    await user.keyboard("{Enter} ");

    expect(
      screen.queryByRole("textbox", { name: "Message to Bob" }),
    ).toBeNull();
  });

  it("is done from their name and from their avatar, but not from what they said", async () => {
    const { user, server } = await enter();
    emit(server, said(BOB, "one", 1));
    const element = rows()[0];
    const row = within(element);
    const writingTo = () =>
      screen.queryByRole("textbox", { name: "Message to Bob" });

    await user.click(row.getByText("one"));
    expect(writingTo()).toBeNull();
    expect(element).toBeInTheDocument();

    await user.click(row.getByText("Bob"));
    await waitFor(() => expect(writingTo()).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: "Stop writing privately" }),
    );
    await waitFor(() => expect(writingTo()).toBeNull());

    await user.click(rows()[0].querySelector<HTMLElement>("[data-avatar]")!);
    expect(
      await screen.findByRole("dialog", { name: /^Profile: Bob/ }),
    ).toBeVisible();
    expect(writingTo()).toBeNull();
  });

  it("keeps the name clickable for somebody online outside the room", async () => {
    const { user, server } = await enter();
    emit(server, said(BOB, "bye", 1));
    act(() => {
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [{ guestId: "guest-me", nickname: "Alice" }, CAROL],
      });
      server.latest.serverEmit("dm:presence", {
        guestIds: [BOB.guestId],
        members: [BOB],
      });
    });

    expect(
      within(rows()[0]).getByText("Bob").closest(".cursor-pointer"),
    ).not.toBeNull();

    await user.click(within(rows()[0]).getByText("Bob"));

    expect(
      await screen.findByRole("textbox", { name: "Message to Bob" }),
    ).toBeInTheDocument();
  });
});

describe("in a private conversation", () => {
  const dm = (text: string, second: number, from = BOB) => ({
    id: `d${++n}`,
    fromGuestId: from.guestId,
    fromNickname: from.nickname,
    fromRole: "guest",
    fromAvatar: "other",
    toGuestId: from === BOB ? "guest-me" : BOB.guestId,
    toNickname: from === BOB ? "Alice" : "Bob",
    toAvatar: "other",
    text,
    sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, second)).toISOString(),
  });

  it("what a person wrote one after another is shown together, and clicking does nothing", async () => {
    const { user, server } = await enter();
    act(() => {
      server.latest.serverEmit("dm:new", dm("psst", 1));
      server.latest.serverEmit("dm:new", dm("are you there", 2));
    });

    // In the room's log the private messages are grouped as well.
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("data-kind", "direct");
    expect(
      within(rows()[0]).getAllByText("Direct message from Bob"),
    ).toHaveLength(1);

    await user.click(
      within(screen.getByRole("list", { name: "Direct messages" })).getByRole(
        "button",
        { name: /^Bob/ },
      ),
    );
    const log = within(
      await screen.findByRole("log", { name: "Direct message with Bob" }),
    );

    expect(log.getAllByRole("listitem")).toHaveLength(1);
    expect(log.getAllByText("Bob")).toHaveLength(1);
  });

  it("keeps private messages clickable for somebody online outside the room", async () => {
    const { user, server } = await enter();
    act(() => server.latest.serverEmit("dm:new", dm("psst", 1)));
    const label = () => within(rows()[0]).getByText("Direct message from Bob");

    expect(label()).toHaveClass("cursor-pointer", "hover:underline");

    act(() => {
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [{ guestId: "guest-me", nickname: "Alice" }, CAROL],
      });
      server.latest.serverEmit("dm:presence", {
        guestIds: [BOB.guestId],
        members: [BOB],
      });
    });

    expect(label()).toHaveClass("cursor-pointer", "hover:underline");

    await user.click(label());
    expect(
      await screen.findByRole("textbox", { name: "Message to Bob" }),
    ).toBeInTheDocument();
  });
});
