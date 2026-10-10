import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const ME = { guestId: "guest-me", nickname: "Alice" };
const BOB = { guestId: "guest-bob", nickname: "Bob" };
const CAROL = { guestId: "guest-carol", nickname: "Carol" };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ROOMS })),
  );
});

const message = (
  id: string,
  from: { guestId: string; nickname: string },
  text: string,
  extra: object = {},
) => ({
  id,
  roomSlug: "general",
  guestId: from.guestId,
  nickname: from.nickname,
  text,
  sentAt: "2026-10-03T12:00:00.000Z",
  ...extra,
});

async function enter(history: unknown[] = []) {
  const server = makeFakeServer({ others: [BOB, CAROL] });
  server.acks["room:join"] = () => ({ ok: true, history });
  const user = userEvent.setup();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("button", { name: "Your profile: Alice" });

  return { user, server };
}

const update = (
  server: ReturnType<typeof makeFakeServer>,
  messageId: string,
  reactions: object[],
  roomSlug = "general",
) =>
  act(() =>
    server.latest.serverEmit("reaction:update", {
      roomSlug,
      messageId,
      reactions,
    }),
  );

const row = (text: string) =>
  within(screen.getByText(text).closest("li") as HTMLElement);

const thumbs = (...users: { guestId: string; nickname: string }[]) => ({
  emoji: "👍",
  users,
});

describe("reacting to a message", () => {
  it("offers the quick reactions on others' messages", async () => {
    await enter([message("m1", BOB, "from bob")]);

    for (const emoji of ["👍", "❤️", "😆", "😮"]) {
      expect(
        row("from bob").getByRole("button", { name: `React with ${emoji}` }),
      ).toBeInTheDocument();
    }
    expect(
      row("from bob").getAllByRole("button", { name: "Add reaction" }),
    ).not.toHaveLength(0);
  });

  it("offers nothing on the guest's own messages, which still show what others added", async () => {
    const { user, server } = await enter([
      message("m1", ME, "from me", { reactions: [thumbs(BOB, CAROL)] }),
    ]);

    const mine = row("from me");
    expect(mine.queryByRole("button", { name: /^React with/ })).toBeNull();
    expect(mine.queryByRole("button", { name: "Add reaction" })).toBeNull();
    expect(mine.queryByRole("button", { name: /^👍/ })).toBeNull();
    const chip = mine.getByRole("img", { name: "👍 2: Bob, Carol" });
    expect(chip).toHaveTextContent("2");
    expect(
      screen.getByText("from me").closest("[data-nav-id]"),
    ).not.toHaveAttribute("aria-keyshortcuts");

    await user.click(chip);
    expect(server.latest.emittedEvents("reaction:toggle")).toEqual([]);
  });

  it("sends the reaction when a quick one is clicked, and does not write to the person", async () => {
    const { user, server } = await enter([message("m1", BOB, "from bob")]);

    await user.click(
      row("from bob").getByRole("button", { name: "React with ❤️" }),
    );

    expect(server.latest.emittedEvents("reaction:toggle")).toEqual([
      { messageId: "m1", emoji: "❤️" },
    ]);
    expect(
      screen.queryByRole("button", { name: /^Send to: Bob/ }),
    ).not.toBeInTheDocument();
  });

  it("opens every emoji from the add button and reacts with the one chosen", async () => {
    const { user, server } = await enter([message("m1", BOB, "from bob")]);

    await user.click(
      row("from bob").getAllByRole("button", { name: "Add reaction" })[0],
    );
    await user.click(
      await screen.findByRole("button", { name: "React with 🔥" }),
    );

    expect(server.latest.emittedEvents("reaction:toggle")).toEqual([
      { messageId: "m1", emoji: "🔥" },
    ]);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "React with 🔥" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("opens the emoji with R when the message has the keyboard focus", async () => {
    const { user } = await enter([message("m1", BOB, "from bob")]);

    const stop = row("from bob").getByRole("button", { name: "Message Bob" });
    expect(stop).toHaveAttribute("aria-keyshortcuts", "R");
    stop.focus();
    await user.keyboard("r");

    expect(
      await screen.findByRole("button", { name: "React with 🔥" }),
    ).toBeInTheDocument();
  });

  it("does not take R typed anywhere else", async () => {
    const { user } = await enter([message("m1", BOB, "from bob")]);

    await user.type(screen.getByLabelText("Message"), "rrr");

    expect(
      screen.queryByRole("button", { name: "React with 🔥" }),
    ).not.toBeInTheDocument();
  });
});

describe("the reactions a message has", () => {
  it("are shown under it with how many, and who, when the server says so", async () => {
    const { server } = await enter([message("m1", BOB, "from bob")]);

    update(server, "m1", [thumbs(BOB, CAROL)]);

    const chip = row("from bob").getByRole("button", {
      name: "👍 2: Bob, Carol",
    });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveAttribute("title", "Bob, Carol");
    expect(chip).toHaveTextContent("2");
  });

  it("are there when the guest joins", async () => {
    await enter([
      message("m1", BOB, "from bob", { reactions: [thumbs(CAROL)] }),
    ]);

    expect(
      row("from bob").getByRole("button", { name: "👍 1: Carol" }),
    ).toBeInTheDocument();
  });

  it("mark the ones the guest made, which a click takes back", async () => {
    const { user, server } = await enter([message("m1", BOB, "from bob")]);
    update(server, "m1", [thumbs(BOB, ME), { emoji: "🎉", users: [CAROL] }]);

    expect(
      row("from bob").getByRole("button", { name: "👍 2: Bob, Alice" }),
    ).toHaveAttribute("aria-pressed", "true");
    const other = row("from bob").getByRole("button", { name: "🎉 1: Carol" });
    expect(other).toHaveAttribute("aria-pressed", "false");

    await user.click(
      row("from bob").getByRole("button", { name: "👍 2: Bob, Alice" }),
    );
    await user.click(other);

    expect(server.latest.emittedEvents("reaction:toggle")).toEqual([
      { messageId: "m1", emoji: "👍" },
      { messageId: "m1", emoji: "🎉" },
    ]);
  });

  it("follow the quick reactions: the guest's own are pressed", async () => {
    const { server } = await enter([message("m1", BOB, "from bob")]);

    update(server, "m1", [thumbs(ME)]);

    expect(
      row("from bob").getByRole("button", { name: "React with 👍" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      row("from bob").getByRole("button", { name: "React with ❤️" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("disappear when the last one is taken back", async () => {
    const { server } = await enter([
      message("m1", BOB, "from bob", { reactions: [thumbs(CAROL)] }),
    ]);

    update(server, "m1", []);

    expect(
      row("from bob").queryByRole("button", { name: /^👍/ }),
    ).not.toBeInTheDocument();
  });

  it("go to the message they are for, in the room they are for", async () => {
    const { server } = await enter([
      message("m1", CAROL, "one"),
      message("m2", BOB, "two", { sentAt: "2026-10-03T12:00:01.000Z" }),
    ]);

    update(server, "m2", [thumbs(CAROL)]);
    update(server, "m1", [thumbs(BOB)], "random");
    update(server, "nope", [thumbs(BOB)]);

    expect(
      row("two").getByRole("button", { name: "👍 1: Carol" }),
    ).toBeInTheDocument();
    expect(
      row("one").queryByRole("button", { name: /^👍 1/ }),
    ).not.toBeInTheDocument();
  });

  it("ignore an update that makes no sense", async () => {
    const { server } = await enter([message("m1", BOB, "from bob")]);

    act(() => {
      server.latest.serverEmit("reaction:update", "nonsense");
      server.latest.serverEmit("reaction:update", {
        roomSlug: "general",
        messageId: "m1",
        reactions: [{ emoji: 7, users: "nobody" }, null],
      });
    });

    expect(
      row("from bob").queryByRole("button", { name: /^\p{Emoji}/u }),
    ).not.toBeInTheDocument();
  });

  it("are not offered on a message whose author was banned", async () => {
    await enter([
      message("m1", BOB, "from bob"),
      {
        id: "m2",
        roomSlug: "general",
        sentAt: "2026-10-03T12:00:05.000Z",
        banned: true,
      },
    ]);

    const log = within(screen.getByRole("log"));
    expect(log.getAllByRole("button", { name: "React with 👍" })).toHaveLength(
      1,
    );
  });
});

describe("when reacting fails", () => {
  it("says so", async () => {
    const { user, server } = await enter([message("m1", BOB, "from bob")]);
    server.sockets[0].acks["reaction:toggle"] = () => ({
      ok: false,
      error: "message_not_found",
    });

    await user.click(
      row("from bob").getByRole("button", { name: "React with 👍" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That message is no longer available to react to.",
    );
  });

  it("says how long to wait when reacting too fast", async () => {
    const { user, server } = await enter([message("m1", BOB, "from bob")]);
    server.sockets[0].acks["reaction:toggle"] = () => ({
      ok: false,
      error: "rate_limited",
      retryAfterMs: 2500,
    });

    await user.click(
      row("from bob").getByRole("button", { name: "React with 👍" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can send again in 3 s",
    );
  });
});

describe("on a touch screen", () => {
  const barOf = (text: string) =>
    row(text).getByRole("button", { name: "React with 👍" }).parentElement!
      .parentElement!;
  const stopOf = (text: string) =>
    row(text).getByRole("button", { name: "Message Bob" });
  const touch = { pointerType: "touch", clientX: 50, clientY: 50 };

  it("shows the quick reactions when a message is held, without choosing the person", async () => {
    await enter([message("m1", BOB, "from bob")]);
    expect(barOf("from bob")).not.toHaveAttribute("data-held");

    fireEvent.pointerDown(stopOf("from bob"), touch);
    await waitFor(() => expect(barOf("from bob")).toHaveAttribute("data-held"));
    fireEvent.pointerUp(stopOf("from bob"), touch);
    fireEvent.click(stopOf("from bob"));

    expect(
      screen.queryByRole("button", { name: /^Send to: Bob/ }),
    ).not.toBeInTheDocument();
  });

  it("still chooses the person on a short tap, and shows nothing", async () => {
    await enter([message("m1", BOB, "from bob")]);

    fireEvent.pointerDown(stopOf("from bob"), touch);
    fireEvent.pointerUp(stopOf("from bob"), touch);
    fireEvent.click(stopOf("from bob"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(barOf("from bob")).not.toHaveAttribute("data-held");
    expect(
      await screen.findByRole("button", { name: /^Send to: Bob/ }),
    ).toBeInTheDocument();
  });

  it("does nothing when the finger moves away, as when scrolling", async () => {
    await enter([message("m1", BOB, "from bob")]);

    fireEvent.pointerDown(stopOf("from bob"), touch);
    fireEvent.pointerMove(stopOf("from bob"), { ...touch, clientY: 90 });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(barOf("from bob")).not.toHaveAttribute("data-held");
  });

  it("is not triggered by holding the mouse button", async () => {
    await enter([message("m1", BOB, "from bob")]);

    fireEvent.pointerDown(stopOf("from bob"), {
      ...touch,
      pointerType: "mouse",
    });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(barOf("from bob")).not.toHaveAttribute("data-held");
  });

  it("hides the quick reactions again after one is chosen, or after a tap elsewhere", async () => {
    const { server } = await enter([message("m1", BOB, "from bob")]);

    fireEvent.pointerDown(stopOf("from bob"), touch);
    await waitFor(() => expect(barOf("from bob")).toHaveAttribute("data-held"));
    fireEvent.pointerUp(stopOf("from bob"), touch);
    const heart = row("from bob").getByRole("button", {
      name: "React with ❤️",
    });
    fireEvent.pointerDown(heart, touch);
    fireEvent.pointerUp(heart, touch);
    fireEvent.click(heart);

    expect(server.latest.emittedEvents("reaction:toggle")).toEqual([
      { messageId: "m1", emoji: "❤️" },
    ]);
    expect(barOf("from bob")).not.toHaveAttribute("data-held");

    fireEvent.pointerDown(stopOf("from bob"), touch);
    await waitFor(() => expect(barOf("from bob")).toHaveAttribute("data-held"));
    fireEvent.pointerUp(stopOf("from bob"), touch);
    fireEvent.pointerDown(document.body, touch);

    await waitFor(() =>
      expect(barOf("from bob")).not.toHaveAttribute("data-held"),
    );
  });
});
