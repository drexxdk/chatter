import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveModerator, saveSession } from "./session";
import { ROOMS, setup, stubRooms } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

function stubLogin(token: string, name: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/moderator/login")
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              token,
              name,
              role: "moderator",
              expiresAt: Date.now() + 3_600_000,
            }),
          }
        : { ok: true, json: async () => ROOMS },
    ),
  );
}

// Signing in leaves the moderator in the lobby, connected.
async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Sign in" }));
  await user.type(
    await screen.findByLabelText("Username or email"),
    "ada@example.com",
  );
  await user.type(screen.getByLabelText("Password"), "correct horse");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

async function signInAndJoin(user: ReturnType<typeof userEvent.setup>) {
  await signIn(user);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
}

async function openTools(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Admin tools" }));
}

// Into the test lab, from the list of rooms.
async function enterTestLab(user: ReturnType<typeof userEvent.setup>) {
  await signIn(user);
  await user.click(
    await screen.findByRole("button", { name: "Join Test lab" }),
  );
  await screen.findByRole("heading", { name: "Test lab", level: 2 });
}

describe("the admin's rooms", () => {
  it("are in the list of rooms for an admin, and not for a moderator", async () => {
    stubLogin("signed-token", "Ada Mod");
    const { user } = setup();

    await signIn(user);
    await screen.findByRole("button", { name: "Account menu: Ada Mod" });

    expect(screen.getByRole("button", { name: "Join General" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Join Test lab" })).toBeNull();
  });

  it("are in the list of rooms for an admin, which goes into one", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await signIn(user);

    expect(
      await screen.findByRole("button", { name: "Join Test lab" }),
    ).toBeVisible();

    // First in the list, before the real rooms.
    const joins = screen
      .getAllByRole("button", { name: /^Join / })
      .map((button) => button.getAttribute("aria-label"));

    expect(joins[0]).toBe("Join Test lab");

    await user.click(screen.getByRole("button", { name: "Join Test lab" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("room:join")).toContainEqual({
        slug: "admin-lab",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Test lab", level: 2 }),
    ).toBeInTheDocument();
  });
});

describe("a new tab", () => {
  it("is signed in as the admin who is signed in in the browser", async () => {
    stubLogin("admin-token", "Ada Admin");
    saveModerator({ nickname: "Ada Admin", token: "admin-token" });
    const server = makeFakeServer();

    setup(server);

    expect(
      await screen.findByRole("button", { name: "Admin tools" }),
    ).toBeInTheDocument();
    expect(server.createSocket.mock.calls[0]?.slice(0, 2)).toEqual([
      "Ada Admin",
      "admin-token",
    ]);
  });

  it("is signed in after signing in, and signs out for the browser too", async () => {
    stubLogin("admin-token", "Ada Admin");
    const { user } = setup();

    await signIn(user);
    await screen.findByRole("button", { name: "Account menu: Ada Admin" });

    expect(localStorage.getItem("chatter.moderator")).toContain("admin-token");

    await user.click(
      screen.getByRole("button", { name: "Account menu: Ada Admin" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() =>
      expect(localStorage.getItem("chatter.moderator")).toBeNull(),
    );
  });
});

describe("reloading in a room", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
  });

  it("brings an admin back into a test room, which the list of rooms does not have until they are connected", async () => {
    stubLogin("admin-token", "Ada Admin");
    saveSession({ nickname: "Ada Admin", token: "admin-token" });
    window.history.replaceState(null, "", "/rooms/admin-lab");
    const server = makeFakeServer();

    setup(server);

    expect(
      await screen.findByRole("heading", { name: "Test lab", level: 2 }),
    ).toBeInTheDocument();
    expect(server.createSocket.mock.calls[0]?.slice(0, 2)).toEqual([
      "Ada Admin",
      "admin-token",
    ]);
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "admin-lab" },
    ]);
  });

  it("keeps whoever it was connected when the room is not theirs, and goes to the lobby", async () => {
    stubLogin("signed-token", "Ada Mod");
    saveSession({ nickname: "Ada Mod", token: "signed-token" });
    window.history.replaceState(null, "", "/rooms/admin-lab");
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: false, error: "room_not_found" });

    setup(server);

    expect(
      await screen.findByRole("button", { name: "Account menu: Ada Mod" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });
});

describe("the admin's tools", () => {
  it("keeps the dropdown open for repeated actions until clicking outside", async () => {
    stubLogin("admin-token", "Ada Admin");
    const { user, server } = setup();
    await signIn(user);
    await openTools(user);

    for (const name of [
      "Add a person",
      "Add a person",
      "Fill the room",
      "Remove a person",
      "Remove everybody",
    ]) {
      await user.click(screen.getByRole("menuitem", { name }));
      expect(screen.getByRole("menu")).toBeVisible();
    }
    expect(server.latest.emittedEvents("admin:fake:add")).toHaveLength(2);
    expect(server.latest.emittedEvents("admin:fake:fill")).toHaveLength(1);
    expect(server.latest.emittedEvents("admin:fake:remove")).toHaveLength(1);
    expect(server.latest.emittedEvents("admin:fake:clear")).toHaveLength(1);

    await user.click(screen.getByRole("heading", { name: "Public rooms" }));
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("keeps keyboard actions open and still allows Escape dismissal", async () => {
    stubLogin("admin-token", "Ada Admin");
    const { user, server } = setup();
    await signIn(user);
    await openTools(user);
    await user.keyboard("{Home}{Enter} ");
    expect(server.latest.emittedEvents("admin:fake:add")).toHaveLength(2);
    expect(screen.getByRole("menu")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("configures admin queue mode and validates simulated people ahead", async () => {
    stubLogin("admin-token", "Ada Admin");
    const { user, server } = setup();
    await signIn(user);
    await openTools(user);
    const toggle = screen.getByRole("checkbox", {
      name: "Queue when rooms are full",
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    const input = screen.getByRole("spinbutton", {
      name: "Simulated people ahead (0–1000)",
    });
    const save = screen.getByRole("button", { name: "Save simulated queue" });
    await user.clear(input);
    await user.type(input, "1001");
    expect(save).toBeDisabled();
    await user.clear(input);
    await user.type(input, "20");
    await user.click(save);
    expect(input).toHaveFocus();
    expect(server.latest.emittedEvents("admin:queue:settings")).toEqual([
      { slug: "admin-lab", enabled: true, ahead: 0 },
      { slug: "admin-lab", enabled: true, ahead: 20 },
    ]);
  });

  it("offers queue advancement to an admin waiting for the Test lab", async () => {
    stubLogin("admin-token", "Ada Admin");
    const { user, server } = setup();
    await signIn(user);
    await openTools(user);
    await user.click(
      screen.getByRole("checkbox", { name: "Queue when rooms are full" }),
    );
    await user.keyboard("{Escape}");
    server.latest.acks["room:join"] = () => ({ ok: false, error: "room_full" });
    server.latest.acks["room:queue:join"] = () => ({
      ok: true,
      queued: true,
      position: 21,
    });
    await user.click(
      await screen.findByRole("button", { name: "Join Test lab" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Queue for Test lab",
    });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Position 21");
    expect(
      within(dialog).queryByRole("button", { name: "Leave queue" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Advance queue" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Admin tools" }),
    );
    await user.click(
      within(dialog).getByRole("menuitem", { name: "Advance queue" }),
    );
    expect(server.latest.emittedEvents("admin:queue:advance")).toEqual([
      { slug: "admin-lab" },
    ]);
    act(() =>
      server.latest.serverEmit("room:queue", {
        roomSlug: "admin-lab",
        position: 20,
      }),
    );
    expect(within(dialog).getByRole("status")).toHaveTextContent("Position 20");
    expect(within(dialog).getByRole("menu")).toBeVisible();
  });

  it("are not there for a moderator", async () => {
    stubLogin("signed-token", "Ada Mod");
    const { user } = setup();

    await signInAndJoin(user);
    await screen.findByRole("button", { name: "Account menu: Ada Mod" });

    expect(screen.queryByRole("button", { name: "Admin tools" })).toBeNull();
  });

  it("work on the Test lab from the list of rooms and from another room", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await signIn(user);
    await openTools(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Add a person" }),
    );

    expect(server.latest.emittedEvents("admin:fake:add")).toEqual([
      { slug: "admin-lab" },
    ]);
    expect(server.latest.emittedEvents("room:join")).toEqual([]);

    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await openTools(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Fill the room" }),
    );

    expect(server.latest.emittedEvents("admin:fake:fill")).toEqual([
      { slug: "admin-lab" },
    ]);
  });

  it("fill a test room", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await enterTestLab(user);
    await openTools(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Fill the room" }),
    );

    expect(server.latest.emittedEvents("admin:fake:fill")).toHaveLength(1);
  });

  it.each([
    ["Inactive", "inactivity", "You were disconnected for being inactive."],
    ["Banned", "banned", "You are banned from this chat."],
    ["Replaced", "replaced", "You opened the chat in another window"],
    ["Expired", "invalid_token", "Your session has expired."],
  ])(
    "returns to the lobby with a persistent explanation for %s",
    async (label, reason, explanation) => {
      stubLogin("admin-token", "Ada Admin");
      const server = makeFakeServer();
      const { user } = setup(server, [0]);

      await signInAndJoin(user);
      await openTools(user);
      await user.click(await screen.findByRole("menuitem", { name: label }));

      expect(server.latest.emittedEvents("admin:kick")).toEqual([{ reason }]);
      act(() => {
        server.latest.serverEmit("kicked", { reason });
        server.latest.serverEmit("disconnect", "io server disconnect");
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(explanation);
      expect(
        await screen.findByRole("heading", { name: "Public rooms" }),
      ).toBeVisible();
      expect(screen.queryByRole("log")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(explanation);
      expect(server.createSocket).toHaveBeenCalledTimes(1);
    },
  );
});

describe("the crowd", () => {
  it("changes the room limit and updates crowd bounds and participant totals live", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);
    await enterTestLab(user);
    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "admin-lab",
        members: [
          { guestId: "mod-1", nickname: "Ada Admin", role: "moderator" },
          { guestId: "mod-2", nickname: "Grace", role: "moderator" },
          { guestId: "guest-bob", nickname: "Bob", role: "guest" },
          { guestId: "member-carol", nickname: "Carol", role: "member" },
        ],
      }),
    );
    expect(
      screen.getByRole("button", { name: "In this room (2 of 10)" }),
    ).toBeVisible();
    await openTools(user);
    const limit = screen.getByRole("spinbutton", { name: "Room limit" });
    expect(limit).toHaveValue(10);
    for (const invalid of ["0", "1001", "1.5"]) {
      await user.clear(limit);
      await user.type(limit, invalid);
      expect(
        screen.getByRole("button", { name: "Save room limit" }),
      ).toBeDisabled();
    }
    await user.clear(limit);
    await user.type(limit, "100{Enter}");
    expect(server.latest.emittedEvents("admin:room:limit")).toEqual([
      { slug: "admin-lab", maxMembers: 100 },
    ]);
    act(() =>
      server.latest.serverEmit("admin:rooms", {
        rooms: [
          { id: -1, name: "Test lab", slug: "admin-lab", maxMembers: 100 },
        ],
      }),
    );
    expect(
      screen.getByRole("button", { name: "In this room (2 of 100)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Number of people (1–100)" }),
    ).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Room limit" })).toHaveValue(
      100,
    );
  });

  const told = (
    server: ReturnType<typeof makeFakeServer>,
    status: string,
    people: number,
    target: number,
  ) =>
    act(() =>
      server.latest.serverEmit("crowd:state", {
        roomSlug: "admin-lab",
        status,
        people,
        target,
      }),
    );

  it("previews separate private and room typing counts and can restart them without closing the menu", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);
    await enterTestLab(user);
    await openTools(user);
    const start = screen.getByRole("button", { name: "Simulate typing" });
    expect(
      screen.queryByRole("button", { name: "Stop simulated typing" }),
    ).not.toBeInTheDocument();
    const direct = screen.getByRole("spinbutton", { name: "Typing to you" });
    const room = screen.getByRole("spinbutton", { name: "Typing to the room" });
    expect(start).toBeDisabled();
    expect(direct).toBeDisabled();
    expect(room).toBeDisabled();
    expect(direct).not.toBeInvalid();
    expect(room).not.toBeInvalid();
    await user.click(start);
    expect(server.latest.emittedEvents("admin:crowd:typing")).toEqual([]);
    told(server, "running", 1, 19);
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute(
      "title",
      "Needs 4 simulated people (1 available)",
    );
    expect(direct).not.toBeInvalid();
    expect(room).not.toBeInvalid();
    told(server, "paused", 19, 19);
    told(server, "paused", 3, 19);
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute(
      "title",
      "Needs 4 simulated people (3 available)",
    );
    told(server, "paused", 19, 19);
    expect(start).toBeEnabled();
    expect(direct).toBeEnabled();
    expect(room).toBeEnabled();
    await user.clear(direct);
    await user.type(direct, "7");
    await user.clear(room);
    await user.type(room, "12{Enter}");
    expect(server.latest.emittedEvents("admin:crowd:typing")).toEqual([
      { room: 12, direct: 7, slug: "admin-lab" },
    ]);
    expect(screen.getByRole("menu")).toBeVisible();
    await user.keyboard("{Escape}");
    await openTools(user);
    expect(
      screen.getByRole("spinbutton", { name: "Typing to you" }),
    ).toHaveValue(7);
    expect(
      screen.getByRole("spinbutton", { name: "Typing to the room" }),
    ).toHaveValue(12);
    await user.click(screen.getByRole("button", { name: "Simulate typing" }));
    expect(server.latest.emittedEvents("admin:crowd:typing").at(-1)).toEqual({
      room: 12,
      direct: 7,
      slug: "admin-lab",
    });
    expect(screen.getByRole("menu")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await openTools(user);
    told(server, "paused", 5, 5);
    expect(
      screen.getByRole("button", { name: "Simulate typing" }),
    ).toBeDisabled();
    const reopenedRoom = screen.getByRole("spinbutton", {
      name: "Typing to the room",
    });
    await user.clear(reopenedRoom);
    await user.type(reopenedRoom, "-1");
    expect(
      screen.getByRole("button", { name: "Simulate typing" }),
    ).toBeDisabled();
  });

  it("previews typing with people added using Fill room without starting a crowd", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);
    await enterTestLab(user);
    await openTools(user);
    await user.click(screen.getByRole("menuitem", { name: "Fill the room" }));
    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "admin-lab",
        members: Array.from({ length: 6 }, (_, index) => ({
          guestId: `fake-${index}`,
          nickname: `Person ${index}`,
          role: "guest",
        })),
      }),
    );
    const start = screen.getByRole("button", { name: "Simulate typing" });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(server.latest.emittedEvents("admin:crowd:typing")).toEqual([
      { room: 3, direct: 1, slug: "admin-lab" },
    ]);
  });

  it("starts with the number typed, 10 until another is", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await enterTestLab(user);
    await openTools(user);
    await user.click(
      await screen.findByRole("button", { name: "Start the crowd" }),
    );

    expect(server.latest.emittedEvents("admin:crowd:start")).toEqual([
      { people: 10, slug: "admin-lab" },
    ]);

    const amount = screen.getByRole("textbox", {
      name: "Number of people (1–10)",
    });

    await user.clear(amount);
    await user.type(amount, "6");
    await user.click(screen.getByRole("button", { name: "Start the crowd" }));

    expect(server.latest.emittedEvents("admin:crowd:start")).toEqual([
      { people: 10, slug: "admin-lab" },
      { people: 6, slug: "admin-lab" },
    ]);
  });

  it("starts from the box with Enter, and takes no more than the room holds", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await enterTestLab(user);
    await openTools(user);

    const amount = await screen.findByRole("textbox", {
      name: "Number of people (1–10)",
    });

    for (const wrong of ["11", "0", "", "ten", "2.5"]) {
      await user.clear(amount);
      if (wrong) await user.type(amount, wrong);

      expect(amount).toBeInvalid();
      expect(
        screen.getByRole("button", { name: "Start the crowd" }),
      ).toBeDisabled();
    }

    await user.clear(amount);
    await user.type(amount, "10{Enter}");

    expect(server.latest.emittedEvents("admin:crowd:start")).toEqual([
      { people: 10, slug: "admin-lab" },
    ]);
  });

  it("drops the message that the room is full once its count shows room", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: false, error: "room_full" });
    const { user } = setup(server);

    await signIn(user);
    await user.click(
      await screen.findByRole("button", { name: "Join Test lab" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This room is full.",
    );

    const count = (people: number) =>
      act(() =>
        server.latest.serverEmit("admin:count", {
          roomSlug: "admin-lab",
          count: people,
        }),
      );

    await count(10);
    expect(screen.getByRole("alert")).toBeVisible();

    await count(9);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("is counted on the Test lab's card in the list of rooms", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await signIn(user);
    await screen.findByRole("button", { name: "Join Test lab" });

    const card = within(
      screen.getByRole("heading", { name: "Test lab" }).closest("li")!,
    );

    expect(card.getByText("Nobody here now")).toBeVisible();

    act(() =>
      server.latest.serverEmit("admin:count", {
        roomSlug: "admin-lab",
        count: 6,
      }),
    );

    expect(await card.findByText("6 people here now")).toBeVisible();
  });

  it("shows how it stands, and can be paused, carried on and stopped", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await enterTestLab(user);
    await told(server, "running", 7, 25);
    await openTools(user);

    expect(await screen.findByText(/Running · 7 of 25/)).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Start the crowd" }),
    ).toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "Pause" }));

    expect(server.latest.emittedEvents("admin:crowd:pause")).toHaveLength(1);

    await told(server, "paused", 7, 25);
    expect(screen.getByRole("menu")).toBeVisible();
    await user.click(await screen.findByRole("menuitem", { name: "Carry on" }));

    expect(server.latest.emittedEvents("admin:crowd:resume")).toHaveLength(1);

    await told(server, "running", 7, 25);
    expect(screen.getByRole("menu")).toBeVisible();
    await user.click(
      await screen.findByRole("menuitem", { name: "Stop and send them away" }),
    );

    expect(server.latest.emittedEvents("admin:crowd:stop")).toHaveLength(1);
    await told(server, "stopped", 0, 0);
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("changes how many there are while it runs, and keeps the menu open for it", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await enterTestLab(user);
    await told(server, "running", 10, 10);
    await openTools(user);

    const amount = await screen.findByRole("textbox", {
      name: "Number of people (1–10)",
    });

    await user.clear(amount);
    await user.type(amount, "5");
    await user.click(screen.getByRole("button", { name: "Change" }));

    expect(server.latest.emittedEvents("admin:crowd:people")).toEqual([
      { people: 5, slug: "admin-lab" },
    ]);
    expect(screen.getByRole("menuitem", { name: "Pause" })).toBeVisible();
  });
});
