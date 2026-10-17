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
  await user.click(
    await screen.findByRole("button", { name: "Sign in as moderator" }),
  );
  await user.type(await screen.findByLabelText("Email"), "ada@example.com");
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

  it("show being removed, for the reason chosen", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await signInAndJoin(user);
    await openTools(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "For being banned" }),
    );

    expect(server.latest.emittedEvents("admin:kick")).toEqual([
      { reason: "banned" },
    ]);
  });
});

describe("the crowd", () => {
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
    await openTools(user);
    await user.click(await screen.findByRole("menuitem", { name: "Carry on" }));

    expect(server.latest.emittedEvents("admin:crowd:resume")).toHaveLength(1);

    await told(server, "running", 7, 25);
    await openTools(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Stop and send them away" }),
    );

    expect(server.latest.emittedEvents("admin:crowd:stop")).toHaveLength(1);
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
