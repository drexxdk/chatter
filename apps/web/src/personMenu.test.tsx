import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const ME = { guestId: "guest-me", nickname: "Alice" };
const BOB = { guestId: "guest-bob", nickname: "Bob" };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ROOMS })),
  );
});

async function enter() {
  const server = makeFakeServer({ others: [BOB] });
  const user = userEvent.setup();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("button", { name: "Your profile: Alice" });

  return { user, server };
}

let n = 0;
const said = (from: { guestId: string; nickname: string }, text: string) => ({
  id: `m${++n}`,
  roomSlug: "general",
  guestId: from.guestId,
  nickname: from.nickname,
  text,
  sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, n)).toISOString(),
});

const say = (
  server: ReturnType<typeof makeFakeServer>,
  from: { guestId: string; nickname: string },
  text: string,
) => act(() => server.latest.serverEmit("message:new", said(from, text)));

describe("the options button of a message", () => {
  it("is on other people's messages and not on the guest's own", async () => {
    const { server } = await enter();

    say(server, BOB, "from bob");
    say(server, ME, "from me");

    const log = within(screen.getByRole("log"));
    expect(
      log.getAllByRole("button", { name: "Actions for Bob" }),
    ).toHaveLength(1);
    expect(log.queryByRole("button", { name: "Actions for Alice" })).toBeNull();
  });

  it("is the only thing that opens the menu: clicking the message chooses the person instead", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");

    await user.click(screen.getByText("from bob"));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Send to: Bob/ }),
    ).toBeInTheDocument();
  });

  it("offers to write to the person, open the private chat, or block them", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");

    await user.click(screen.getByRole("button", { name: "Actions for Bob" }));

    const menu = within(await screen.findByRole("menu"));
    expect(
      menu.getByRole("menuitem", { name: "Message Bob" }),
    ).toBeInTheDocument();
    expect(
      menu.getByRole("menuitem", { name: "Open private chat" }),
    ).toBeInTheDocument();
    expect(
      menu.getByRole("menuitem", { name: "Block Bob" }),
    ).toBeInTheDocument();
  });

  it("writes to the person with Message", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");

    await user.click(screen.getByRole("button", { name: "Actions for Bob" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Message Bob" }),
    );

    expect(
      await screen.findByRole("button", { name: /^Send to: Bob/ }),
    ).toBeInTheDocument();
  });

  it("opens the private chat", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");

    await user.click(screen.getByRole("button", { name: "Actions for Bob" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Open private chat" }),
    );

    expect(
      await screen.findByRole("button", { name: "Back to the room" }),
    ).toBeInTheDocument();
  });

  it("blocks the person, and then offers to unblock them", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");

    await user.click(screen.getByRole("button", { name: "Actions for Bob" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Block Bob" }),
    );

    await waitFor(() =>
      expect(server.latest.emittedEvents("dm:block")).toEqual([
        { guestId: BOB.guestId },
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Actions for Bob" }));
    expect(
      await screen.findByRole("menuitem", { name: "Unblock Bob" }),
    ).toBeInTheDocument();
  });

  it("is reached with the arrow keys from the message, and Escape from the menu returns to its button", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");
    const stop = screen.getByRole("button", { name: "Message Bob" });
    const bar = () =>
      within(screen.getByRole("log")).getAllByRole("button", {
        name: /^(React with|Add reaction|Actions for Bob)/,
      });

    stop.focus();
    await user.keyboard("{ArrowRight}");
    expect(bar()[0]).toHaveFocus();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("button", { name: "Add reaction" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const options = screen.getByRole("button", { name: "Actions for Bob" });
    expect(options).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(options).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(options).toHaveFocus());

    await user.keyboard(
      "{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}",
    );
    expect(stop).toHaveFocus();
  });

  it("opens with the menu key when the message has the keyboard focus", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");

    screen.getByRole("button", { name: "Message Bob" }).focus();
    await user.keyboard("{ContextMenu}");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("is also on private messages in the room's log, for the person they are with", async () => {
    const { server } = await enter();

    act(() =>
      server.latest.serverEmit("dm:new", {
        id: "d1",
        fromGuestId: BOB.guestId,
        fromNickname: "Bob",
        fromRole: "guest",
        fromAvatar: "other",
        toGuestId: ME.guestId,
        toNickname: "Alice",
        toAvatar: "other",
        text: "psst",
        sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, 1)).toISOString(),
      }),
    );

    expect(
      within(screen.getByRole("log")).getByRole("button", {
        name: "Actions for Bob",
      }),
    ).toBeInTheDocument();
  });
});

describe("somebody who has left the room", () => {
  const leave = (server: ReturnType<typeof makeFakeServer>) =>
    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [{ guestId: ME.guestId, nickname: "Alice" }],
      }),
    );

  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      screen.getAllByRole("button", { name: "Actions for Bob" })[0],
    );

    return within(await screen.findByRole("menu"));
  };

  it("is marked on their messages, which stay", async () => {
    const { server } = await enter();
    say(server, BOB, "from bob");
    expect(screen.queryByText("Left the room")).toBeNull();

    leave(server);

    const row = within(screen.getByText("from bob").closest("li")!);
    expect(row.getByText("Left the room")).toBeInTheDocument();
    expect(row.getByText("from bob")).toBeInTheDocument();
  });

  it("cannot be opened a private chat with when nothing was ever written to each other", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");
    leave(server);

    const menu = await openMenu(user);

    expect(
      menu.getByRole("menuitem", { name: "Open private chat" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(menu.getByRole("menuitem", { name: "Message Bob" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("still has the private chat to open when they have written to the guest before", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");
    act(() =>
      server.latest.serverEmit("dm:new", {
        id: "d1",
        fromGuestId: BOB.guestId,
        fromNickname: "Bob",
        fromRole: "guest",
        fromAvatar: "other",
        toGuestId: ME.guestId,
        toNickname: "Alice",
        toAvatar: "other",
        text: "psst",
        sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, 1)).toISOString(),
      }),
    );
    leave(server);

    const menu = await openMenu(user);

    expect(
      menu.getByRole("menuitem", { name: "Open private chat" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});
