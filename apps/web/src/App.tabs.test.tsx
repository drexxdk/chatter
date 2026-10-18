import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TabCoordinator } from "./activeTab";
import { saveSession } from "./session";
import { App, joinRoom, leaveRoom, stubRooms } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

// Another tab of the browser, as far as this one can tell.
function otherTabs(inRoom: boolean) {
  let displace = () => {};
  const coordinator = {
    otherInRoom: vi.fn(async () => inRoom),
    setInRoom: vi.fn(),
    claim: vi.fn(() => {
      inRoom = false;
    }),
    onDisplaced: vi.fn((listener: () => void) => {
      displace = listener;
      return () => {};
    }),
    close: vi.fn(),
  } satisfies TabCoordinator;

  return { coordinator, displace: () => act(() => displace()) };
}

function open(tabs: TabCoordinator, server = makeFakeServer()) {
  const user = userEvent.setup();

  render(<App createSocket={server.createSocket} tabs={tabs} />);

  return { user, server };
}

beforeEach(() => {
  stubRooms();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
});

describe("one room for the whole browser", () => {
  it("says so, and does not join, when another tab is in a room", async () => {
    const { coordinator } = otherTabs(true);
    const { user, server } = open(coordinator);

    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "You are already in a chat room",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nickname")).toBeNull();
    expect(server.createSocket).not.toHaveBeenCalled();
  });

  it("takes the room over from the other tab when asked, and goes on to join", async () => {
    const { coordinator } = otherTabs(true);
    const { user, server } = open(coordinator);

    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Use this tab" }),
    );

    expect(coordinator.claim).toHaveBeenCalledTimes(1);
    await user.type(await screen.findByLabelText("Nickname"), "Alice");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "General", level: 2 }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
    ]);
  });

  it("leaves the notice without joining when it is closed", async () => {
    const { coordinator } = otherTabs(true);
    const { user } = open(coordinator);

    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.click(await screen.findByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "You are already in a chat room",
        }),
      ).toBeNull(),
    );
    expect(coordinator.claim).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Join General" })).toBeVisible();
  });

  it("says when it is in a room, and when it is not", async () => {
    const { coordinator } = otherTabs(false);
    const { user } = open(coordinator);

    await joinRoom(user);
    await screen.findByRole("heading", { name: "General", level: 2 });

    expect(coordinator.setInRoom).toHaveBeenLastCalledWith(true);

    await leaveRoom(user);

    await waitFor(() =>
      expect(coordinator.setInRoom).toHaveBeenLastCalledWith(false),
    );
  });

  it("leaves its room and says why when another tab takes over, and can take it back", async () => {
    const { coordinator, displace } = otherTabs(false);
    const { user, server } = open(coordinator);

    await joinRoom(user);
    await screen.findByRole("heading", { name: "General", level: 2 });

    displace();

    expect(
      await screen.findByRole("heading", {
        name: "You are already in a chat room",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(server.latest.emittedEvents("room:leave")).toHaveLength(1),
    );
    expect(
      screen.queryByRole("heading", { name: "General", level: 2 }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Use this tab" }));

    expect(coordinator.claim).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("heading", { name: "General", level: 2 }),
    ).toBeInTheDocument();
  });

  it("does not join on a reload either, while another tab is in a room", async () => {
    saveSession({ nickname: "Alice" });
    window.history.replaceState(null, "", "/rooms/general");
    const { coordinator } = otherTabs(true);
    const { server } = open(coordinator);

    expect(
      await screen.findByRole("heading", {
        name: "You are already in a chat room",
      }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("room:join")).toEqual([]);
    expect(window.location.pathname).toBe("/");
  });
});
