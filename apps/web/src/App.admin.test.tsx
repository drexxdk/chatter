import { screen, waitFor } from "@testing-library/react";
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

async function signInAndJoin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Sign in as moderator" }),
  );
  await user.type(await screen.findByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await user.click(await screen.findByRole("button", { name: "Join General" }));
}

describe("the admin's tools", () => {
  it("are not there for a moderator", async () => {
    stubLogin("signed-token", "Ada Mod");
    const { user } = setup();

    await signInAndJoin(user);
    await screen.findByRole("button", { name: "Account menu: Ada Mod" });

    expect(screen.queryByRole("button", { name: "Admin tools" })).toBeNull();
  });

  it("are in a menu of their own, for an admin", async () => {
    stubLogin("admin-token", "Ada Admin");
    const { user } = setup();

    await signInAndJoin(user);
    await user.click(
      await screen.findByRole("button", { name: "Admin tools" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Test lab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Test room (4 people)" }),
    ).toBeInTheDocument();
  });

  it("go into a test room, which the lobby does not list", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await signInAndJoin(user);
    await user.click(
      await screen.findByRole("button", { name: "Admin tools" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Test lab" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("room:join")).toContainEqual({
        slug: "admin-lab",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Test lab", level: 2 }),
    ).toBeInTheDocument();
  });

  it("add and take away people only in a test room", async () => {
    stubLogin("admin-token", "Ada Admin");
    const server = makeFakeServer();
    const { user } = setup(server);

    await signInAndJoin(user);
    await user.click(
      await screen.findByRole("button", { name: "Admin tools" }),
    );

    // In General, which is a real room: the tools are there but cannot be used.
    expect(
      await screen.findByRole("menuitem", { name: "Fill the room" }),
    ).toHaveAttribute("aria-disabled", "true");

    await user.click(screen.getByRole("menuitem", { name: "Test lab" }));
    await user.click(
      await screen.findByRole("button", { name: "Admin tools" }),
    );
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
    await user.click(
      await screen.findByRole("button", { name: "Admin tools" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "For being banned" }),
    );

    expect(server.latest.emittedEvents("admin:kick")).toEqual([
      { reason: "banned" },
    ]);
  });
});
