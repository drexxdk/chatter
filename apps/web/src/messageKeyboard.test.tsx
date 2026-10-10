import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const BOB = { guestId: "guest-bob", nickname: "Bob" };
const ME = { guestId: "guest-me", nickname: "Alice" };

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
const say = (
  server: ReturnType<typeof makeFakeServer>,
  from: { guestId: string; nickname: string },
  text: string,
  extra: Record<string, unknown> = {},
) =>
  act(() =>
    server.latest.serverEmit("message:new", {
      id: `m${++n}`,
      roomSlug: "general",
      guestId: from.guestId,
      nickname: from.nickname,
      text,
      sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, n)).toISOString(),
      ...extra,
    }),
  );

const stopOf = (text: string) =>
  screen
    .getByText(text)
    .closest("[data-message]")!
    .querySelector<HTMLElement>("[data-nav-id]")!;

describe("the keyboard in the messages", () => {
  it("walks left and right through what can be done with a message, in the order it is shown, and back", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob", {
      reactions: [
        { emoji: "🔥", users: [{ guestId: "guest-carol", nickname: "Carol" }] },
      ],
    });
    stopOf("from bob").focus();

    const seen: (string | null)[] = [];
    for (let i = 0; i < 8; i++) {
      await user.keyboard("{ArrowRight}");
      const here = document.activeElement as HTMLElement;
      seen.push(here.getAttribute("aria-label"));
    }

    expect(seen.slice(0, 6)).toEqual([
      "React with 👍",
      "React with ❤️",
      "React with 😆",
      "React with 😮",
      "Add reaction",
      "Actions for Bob",
    ]);
    // Then the reactions under the message, and no further.
    expect(seen[6]).toContain("🔥");
    expect(seen[7]).toBe(seen[6]);

    for (let i = 0; i < 7; i++) await user.keyboard("{ArrowLeft}");
    expect(stopOf("from bob")).toHaveFocus();
  });

  it("changes message with up and down, from the message or from any of its actions", async () => {
    const { user, server } = await enter();
    say(server, BOB, "first");
    say(server, BOB, "second");

    stopOf("second").focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(
      screen.getAllByRole("button", { name: "React with ❤️" })[1],
    ).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(stopOf("first")).toHaveFocus();

    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(stopOf("second")).toHaveFocus();
  });

  it("goes back to the message with Escape, or with left from the first action", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");
    stopOf("from bob").focus();

    await user.keyboard("{ArrowRight}{ArrowRight}{Escape}");
    expect(stopOf("from bob")).toHaveFocus();

    await user.keyboard("{ArrowRight}{ArrowLeft}");
    expect(stopOf("from bob")).toHaveFocus();
  });

  it("has nothing to go into on a message without actions, such as the guest's own", async () => {
    const { user, server } = await enter();
    say(server, ME, "from me");
    stopOf("from me").focus();

    await user.keyboard("{ArrowRight}");

    expect(stopOf("from me")).toHaveFocus();
  });

  it("opens an action with Space as with Enter, and Escape closes it and returns to its button, then to the message", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");
    stopOf("from bob").focus();

    await user.keyboard("{ArrowRight>5}{ArrowRight}");
    const options = screen.getByRole("button", { name: "Actions for Bob" });
    expect(options).toHaveFocus();
    await user.keyboard(" ");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(options).toHaveFocus());

    await user.keyboard("{ArrowLeft}");
    const add = screen.getByRole("button", { name: "Add reaction" });
    expect(add).toHaveFocus();
    await user.keyboard(" ");
    expect(
      await screen.findByRole("dialog", { name: "Add reaction" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(add).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(stopOf("from bob")).toHaveFocus();
  });

  it("chooses the person with Space on the message, as with Enter", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");
    stopOf("from bob").focus();

    await user.keyboard(" ");

    expect(
      await screen.findByRole("button", { name: /^Send to: Bob/ }),
    ).toBeInTheDocument();
  });

  it("goes from the message box back to the messages with Escape", async () => {
    const { user, server } = await enter();
    say(server, BOB, "from bob");

    await user.click(screen.getByRole("textbox", { name: "Message" }));
    await user.keyboard("{Escape}");

    expect(stopOf("from bob")).toHaveFocus();
  });

  it("is one Tab stop for all the messages", async () => {
    const { server } = await enter();
    say(server, BOB, "one");
    say(server, BOB, "two");
    say(server, BOB, "three");

    const tabbable = Array.from(
      screen
        .getByRole("log")
        .querySelectorAll<HTMLElement>("button, [tabindex]"),
    ).filter((element) => element.tabIndex >= 0);

    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(stopOf("three"));
  });
});
