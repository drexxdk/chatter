import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      await screen.findByRole("button", { name: "Join Test room (4 people)" }),
    ).toBeVisible();

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

describe("the admin's tools", () => {
  it("are not there for a moderator", async () => {
    stubLogin("signed-token", "Ada Mod");
    const { user } = setup();

    await signInAndJoin(user);
    await screen.findByRole("button", { name: "Account menu: Ada Mod" });

    expect(screen.queryByRole("button", { name: "Admin tools" })).toBeNull();
  });

  it("add and take away people only in a test room", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await signInAndJoin(user);
    await openTools(user);

    // In General, which is a real room: the tools are there but cannot be used.
    expect(
      await screen.findByRole("menuitem", { name: "Fill the room" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitem", { name: "Start the crowd" }),
    ).toHaveAttribute("aria-disabled", "true");
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

  it("starts with the number chosen, 25 until another is", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await enterTestLab(user);
    await openTools(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Start the crowd" }),
    );

    expect(server.latest.emittedEvents("admin:crowd:start")).toEqual([
      { people: 25 },
    ]);

    await openTools(user);
    await user.click(await screen.findByRole("menuitem", { name: "100" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Start the crowd" }),
    );

    expect(server.latest.emittedEvents("admin:crowd:start")).toEqual([
      { people: 25 },
      { people: 100 },
    ]);
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
    await told(server, "running", 25, 25);
    await openTools(user);
    await user.click(await screen.findByRole("menuitem", { name: "50" }));

    expect(server.latest.emittedEvents("admin:crowd:people")).toEqual([
      { people: 50 },
    ]);
    expect(screen.getByRole("menuitem", { name: "Pause" })).toBeVisible();
  });
});
