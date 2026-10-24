import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";
import { publicIdentityTag } from "./identity";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const ME = { guestId: "guest-me", nickname: "Alice" };
const BOB = { guestId: "guest-bob", nickname: "Bob" };

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

async function enter(history: unknown[]) {
  const server = makeFakeServer({ others: [BOB] });
  server.acks["room:join"] = () => ({ ok: true, history });
  const user = userEvent.setup();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("log", { name: "General" });

  return { user, server };
}

const row = (text: string) =>
  within(screen.getByText(text).closest("li") as HTMLElement);

async function openReport(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) {
  await user.click(
    row(text).getAllByRole("button", { name: /^Actions for/ })[0],
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Report message" }),
  );
  return screen.findByRole("dialog", { name: "Report this message" });
}

const HIDDEN = "Message hidden after being reported";

describe("reporting a message", () => {
  it("is offered on other people's messages, not on the guest's own", async () => {
    const { user } = await enter([
      message("m1", BOB, "from bob"),
      message("m2", ME, "from me"),
    ]);

    await user.click(
      row("from bob").getByRole("button", { name: "Actions for Bob" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Report message" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByText("from me").closest("li") as HTMLElement,
      ).queryByRole("button", { name: /^Actions for/ }),
    ).toBeNull();
  });

  it("is not offered on a moderator's message", async () => {
    const { user } = await enter([
      message("m1", BOB, "from the mod", { role: "moderator" }),
    ]);

    await user.click(
      row("from the mod").getByRole("button", { name: "Actions for Bob" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: /^Message Bob/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Report message" }),
    ).toBeNull();
  });

  it("asks why, and sends the reason with the message", async () => {
    const { user, server } = await enter([message("m1", BOB, "rude words")]);

    const dialog = await openReport(user, "rude words");
    expect(dialog).toHaveTextContent(
      `Bob \u00b7 ${publicIdentityTag(BOB.guestId)} wrote this`,
    );
    expect(
      within(dialog).getByRole("radio", { name: "Something else" }),
    ).toBeChecked();

    await user.click(within(dialog).getByRole("radio", { name: "Spam" }));
    await user.click(within(dialog).getByRole("button", { name: "Report" }));

    expect(server.latest.emittedEvents("message:report")).toEqual([
      { messageId: "m1", reason: "spam" },
    ]);
  });

  it("hides the message for the guest at once and closes the dialog", async () => {
    const { user } = await enter([
      message("m1", BOB, "rude words"),
      message("m2", BOB, "fine words"),
    ]);

    const dialog = await openReport(user, "rude words");
    await user.click(within(dialog).getByRole("button", { name: "Report" }));

    expect(await screen.findByText(HIDDEN)).toBeInTheDocument();
    expect(screen.queryByText("rude words")).toBeNull();
    expect(screen.getByText("fine words")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("can be cancelled without sending anything", async () => {
    const { user, server } = await enter([message("m1", BOB, "rude words")]);

    const dialog = await openReport(user, "rude words");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("rude words")).toBeInTheDocument();
    expect(server.latest.emittedEvents("message:report")).toEqual([]);
  });

  it("keeps the dialog and the message, and says why, when the report fails", async () => {
    const { user, server } = await enter([message("m1", BOB, "rude words")]);
    server.sockets[0].acks["message:report"] = () => ({
      ok: false,
      error: "message_not_found",
    });

    const dialog = await openReport(user, "rude words");
    await user.click(within(dialog).getByRole("button", { name: "Report" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That message is no longer available.",
    );
    expect(screen.getByText("rude words")).toBeInTheDocument();
    expect(screen.queryByText(HIDDEN)).toBeNull();
  });

  it("says how long to wait when reporting too often", async () => {
    const { user, server } = await enter([message("m1", BOB, "rude words")]);
    server.sockets[0].acks["message:report"] = () => ({
      ok: false,
      error: "rate_limited",
      retryAfterMs: 12_000,
    });

    const dialog = await openReport(user, "rude words");
    await user.click(within(dialog).getByRole("button", { name: "Report" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You can send again in 12 s",
    );
  });
});

describe("a message the server hid", () => {
  it("turns into a placeholder for everybody in the room", async () => {
    const { server } = await enter([message("m1", BOB, "rude words")]);

    act(() =>
      server.latest.serverEmit("message:hidden", {
        roomSlug: "general",
        id: "m1",
      }),
    );

    expect(await screen.findByText(HIDDEN)).toBeInTheDocument();
    expect(screen.queryByText("rude words")).toBeNull();
    expect(screen.queryByRole("button", { name: /^React with/ })).toBeNull();
  });

  it("is shown as a placeholder from the history of a room joined later", async () => {
    await enter([
      {
        id: "m1",
        roomSlug: "general",
        sentAt: "2026-10-03T12:00:00.000Z",
        hidden: true,
      },
      message("m2", BOB, "fine words"),
    ]);

    expect(await screen.findByText(HIDDEN)).toBeInTheDocument();
    expect(screen.queryByText("This user was banned")).toBeNull();
    expect(screen.getByText("fine words")).toBeInTheDocument();
  });

  it("ignores a notice for another room or without a message", async () => {
    const { server } = await enter([message("m1", BOB, "rude words")]);

    act(() => {
      server.latest.serverEmit("message:hidden", {
        roomSlug: "random",
        id: "m1",
      });
      server.latest.serverEmit("message:hidden", { roomSlug: "general" });
      server.latest.serverEmit("message:hidden", "nonsense");
    });

    expect(screen.getByText("rude words")).toBeInTheDocument();
  });

  it("is not turned back into the message by a copy that arrives live", async () => {
    const { server } = await enter([message("m1", BOB, "rude words")]);

    act(() => {
      server.latest.serverEmit("message:hidden", {
        roomSlug: "general",
        id: "m1",
      });
      server.latest.serverEmit("message:new", message("m1", BOB, "rude words"));
    });

    expect(screen.queryByText("rude words")).toBeNull();
    expect(await screen.findByText(HIDDEN)).toBeInTheDocument();
  });
});
