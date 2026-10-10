import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { ProfileDialog } from "./components/ProfileDialog";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ROOMS })),
  );
});

async function enter(
  server = makeFakeServer(),
  { age = "", avatar = "" }: { age?: string; avatar?: string } = {},
) {
  const user = userEvent.setup();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");
  if (avatar) await user.click(screen.getByRole("radio", { name: avatar }));
  if (age) await user.type(screen.getByLabelText("Age"), age);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("button", { name: "Your profile: Alice" });

  return { user, server };
}

const openProfile = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /^Your profile:/ }));

  return within(await screen.findByRole("dialog", { name: "Your profile" }));
};

describe("saying who you are when joining", () => {
  it("sends the age that was given, and keeps it for a reload", async () => {
    const { server } = await enter(makeFakeServer(), {
      age: "27",
      avatar: "Female",
    });

    expect(server.createSocket).toHaveBeenCalledWith(
      "Alice",
      undefined,
      "female",
      undefined,
      27,
    );
    expect(
      JSON.parse(sessionStorage.getItem("chatter.session")!),
    ).toMatchObject({ nickname: "Alice", avatar: "female", age: 27 });
  });

  it("does not need an age", async () => {
    const { server } = await enter();

    expect(server.createSocket).toHaveBeenCalledWith("Alice");
  });

  it.each(["12", "17", "121"])("does not join with the age %s", async (age) => {
    const user = userEvent.setup();
    const server = makeFakeServer();
    render(<App createSocket={server.createSocket} />);
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.type(await screen.findByLabelText("Nickname"), "Alice");
    await user.type(screen.getByLabelText("Age"), age);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByLabelText("Age")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(server.createSocket).not.toHaveBeenCalled();
  });

  it("takes only digits in the age box, whatever is typed or pasted", async () => {
    const user = userEvent.setup();
    render(<App createSocket={makeFakeServer().createSocket} />);
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );

    await user.type(await screen.findByLabelText("Age"), "a2b.7-x");

    expect(screen.getByLabelText("Age")).toHaveValue("27");

    await user.clear(screen.getByLabelText("Age"));
    await user.click(screen.getByLabelText("Age"));
    await user.paste("4 1e");

    expect(screen.getByLabelText("Age")).toHaveValue("41");
  });
});

describe("the profile button", () => {
  it("is the guest's avatar, without a tooltip that names it", async () => {
    await enter();

    const button = screen.getByRole("button", { name: "Your profile: Alice" });

    expect(button.querySelector("[data-avatar]")).not.toHaveAttribute("title");
  });

  it("opens a modal with who the guest is", async () => {
    const { user } = await enter(makeFakeServer(), {
      age: "31",
      avatar: "Trans",
    });

    const dialog = await openProfile(user);

    expect(dialog.getByLabelText("Nickname")).toHaveValue("Alice");
    expect(dialog.getByRole("radio", { name: "Trans" })).toBeChecked();
    expect(dialog.getByLabelText("Age")).toHaveValue("31");
  });

  it("changes what was changed, tells the server only that, and shows the new name", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "Alicia");
    await user.click(dialog.getByRole("radio", { name: "Female" }));
    await user.type(dialog.getByLabelText("Age"), "29");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("profile:update")).toEqual([
        { nickname: "Alicia", avatar: "female", age: 29 },
      ]),
    );
    expect(
      await screen.findByRole("button", { name: "Your profile: Alicia" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      JSON.parse(sessionStorage.getItem("chatter.session")!),
    ).toMatchObject({ nickname: "Alicia", avatar: "female", age: 29 });
  });

  it("takes the age back when the box is emptied", async () => {
    const { user, server } = await enter(makeFakeServer(), { age: "40" });
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Age"));
    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("profile:update")).toEqual([
        { age: null },
      ]),
    );
    expect(
      JSON.parse(sessionStorage.getItem("chatter.session")!).age,
    ).toBeUndefined();
  });

  it("sends nothing when nothing changed", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(server.latest.emittedEvents("profile:update")).toEqual([]);
  });

  it("does not send a nickname or an age the server would refuse", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "A");
    await user.type(dialog.getByLabelText("Age"), "5");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(dialog.getByLabelText("Nickname")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(dialog.getByLabelText("Age")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(server.latest.emittedEvents("profile:update")).toEqual([]);
  });

  it("says why the server refused, and stays open", async () => {
    const { user, server } = await enter();
    server.latest.acks["profile:update"] = () => ({
      ok: false,
      error: "reserved_nickname",
    });
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "Ada Mod");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "That nickname is reserved. Pick another one.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says how long to wait when the profile was changed too often", async () => {
    const { user, server } = await enter();
    server.latest.acks["profile:update"] = () => ({
      ok: false,
      error: "rate_limited",
      retryAfterMs: 20_000,
    });
    const dialog = await openProfile(user);

    await user.type(dialog.getByLabelText("Age"), "33");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "You have changed your profile too often. You can change it again in 20 s.",
    );
  });

  it("closes without changing anything", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.type(dialog.getByLabelText("Age"), "33");
    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(server.latest.emittedEvents("profile:update")).toEqual([]);
  });
});

describe("others' ages", () => {
  it("are shown next to their names in the room, and only when given", async () => {
    const server = makeFakeServer({
      others: [
        { guestId: "guest-bob", nickname: "Bob", age: 41 },
        { guestId: "guest-carol", nickname: "Carol" },
      ],
    });
    await enter(server);

    const people = within(
      screen.getByRole("list", { name: "People in this room" }),
    );

    expect(
      people.getByRole("button", { name: /^Bob\s*41 years old$/ }),
    ).toBeInTheDocument();
    expect(people.getByRole("button", { name: "Carol" })).toBeInTheDocument();
  });

  it("follow a guest who changes their name: the conversation carries the new one", async () => {
    const server = makeFakeServer({
      others: [{ guestId: "guest-bob", nickname: "Bob" }],
    });
    const { user } = await enter(server);
    await user.click(
      within(
        screen.getByRole("list", { name: "People in this room" }),
      ).getByRole("button", { name: "Bob" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Direct message with Bob" }),
    ).toBeInTheDocument();

    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [
          { guestId: "guest-me", nickname: "Alice" },
          { guestId: "guest-bob", nickname: "Robert", avatar: "male" },
        ],
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Direct message with Robert",
      }),
    ).toBeInTheDocument();
  });
});

describe("a moderator's profile", () => {
  it("is only shown, because the name belongs to the account", async () => {
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={async () => ({ ok: true })}
        session={{
          guestId: "g",
          nickname: "Ada Mod",
          role: "moderator",
          avatar: "other",
        }}
      />,
    );

    const dialog = within(await screen.findByRole("dialog"));

    expect(dialog.getByText("Ada Mod")).toBeInTheDocument();
    expect(
      dialog.getByText(/Your name comes from your account/),
    ).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Save" })).toBeNull();
    expect(dialog.queryByLabelText("Nickname")).toBeNull();
  });
});

describe("a nickname somebody in the room already has", () => {
  const TAKEN =
    "Somebody in this room already has that nickname. Pick another one.";

  it("asks the guest for another one instead of letting them in, and lets them in with it", async () => {
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: false, error: "nickname_taken" });
    const user = userEvent.setup();
    render(<App createSocket={server.createSocket} />);
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.type(await screen.findByLabelText("Nickname"), "Alice");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(TAKEN);
    expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Your profile:/ })).toBeNull();

    server.acks["room:join"] = () => ({ ok: true });
    await user.clear(screen.getByLabelText("Nickname"));
    await user.type(screen.getByLabelText("Nickname"), "Alicia");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("button", { name: "Your profile: Alicia" }),
    ).toBeInTheDocument();
  });

  it("asks again when a reload finds the name taken", async () => {
    sessionStorage.setItem(
      "chatter.session",
      JSON.stringify({ nickname: "Alice", guestIds: ["guest-me"] }),
    );
    window.history.replaceState(null, "", "/rooms/general");
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: false, error: "nickname_taken" });

    render(<App createSocket={server.createSocket} />);

    expect(await screen.findByLabelText("Nickname")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(TAKEN);
    expect(window.location.pathname).toBe("/rooms/general");
  });

  it("is refused when the guest renames themselves to it, and says so in the profile", async () => {
    const { user, server } = await enter();
    server.latest.acks["profile:update"] = () => ({
      ok: false,
      error: "nickname_taken",
    });
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "Bob");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(TAKEN);
    expect(
      screen.getByRole("button", { name: "Your profile: Alice", hidden: true }),
    ).toBeInTheDocument();
  });
});
