import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_RECONNECT_DELAYS_MS } from "./chat/useChat";
import { stubRooms, setup, joinRoom, at, message } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

describe("losing the connection", () => {
  const DROP = "transport close";

  async function enterRoom(server = makeFakeServer(), delays = [5, 5, 5]) {
    const result = setup(server, delays);
    await joinRoom(result.user);
    await screen.findByRole("button", { name: "Your profile: Alice" });
    return result;
  }

  function dropConnection(server: ReturnType<typeof makeFakeServer>) {
    act(() => server.latest.serverEmit("disconnect", DROP));
  }

  it("keeps the room on screen, pauses sending, then reconnects and rejoins", async () => {
    // A long first delay keeps the disconnected state on screen long enough to inspect it.
    const { server } = await enterRoom(makeFakeServer(), [150]);
    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({ text: "before the drop" }),
      ),
    );

    dropConnection(server);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Connection lost. Reconnecting…",
    );
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("before the drop")).toBeInTheDocument();

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );

    // Same nickname and the same identity (the server accepts the secret), and the room is rejoined automatically.
    expect(server.createSocket).toHaveBeenLastCalledWith(
      "Alice",
      undefined,
      undefined,
      { guestId: "guest-me", secret: "secret-1" },
    );
    expect(server.latest.emittedEvents("room:join")).toEqual([
      { slug: "general" },
    ]);
    expect(screen.getByLabelText("Message")).toBeEnabled();
    expect(screen.getByText("before the drop")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "In this room (1)" }),
    ).toBeInTheDocument();
  });

  it("keeps recognising the guest's own earlier messages when the server gives a new guest id", async () => {
    const { server } = await enterRoom(makeFakeServer({ refuseResume: true }));
    act(() =>
      server.latest.serverEmit(
        "message:new",
        message({
          guestId: "guest-me",
          nickname: "Alice",
          text: "my old message",
        }),
      ),
    );
    const author = () => within(screen.getByRole("log")).getByText("Alice");
    expect(author()).toHaveClass("text-indigo-300");

    dropConnection(server);
    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );

    expect(server.latest.guestId).toBe("guest-me-2");
    expect(author()).toHaveClass("text-indigo-300");
  });

  it("fills in the messages missed while disconnected, without repeating the ones already shown", async () => {
    const { server } = await enterRoom();
    const seen = message({ text: "already seen", sentAt: at(1) });
    const missed = message({ text: "sent while away", sentAt: at(2) });
    act(() => server.latest.serverEmit("message:new", seen));

    // The server's history on the rejoin holds both: the one shown before the drop and the one sent during it.
    server.acks["room:join"] = () => ({ ok: true, history: [seen, missed] });
    dropConnection(server);
    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );

    const texts = within(screen.getByRole("log"))
      .getAllByText(/already seen|sent while away/)
      .map((node) => node.textContent);
    expect(texts).toEqual(["already seen", "sent while away"]);
  });

  it("can send again after reconnecting", async () => {
    const { user, server } = await enterRoom();

    dropConnection(server);
    await waitFor(() => expect(screen.getByLabelText("Message")).toBeEnabled());
    await user.type(screen.getByLabelText("Message"), "back again");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: "back again" },
      ]),
    );
  });

  it("keeps trying through temporary failures", async () => {
    const { server } = await enterRoom();
    server.failNextConnections("connection", "unavailable");

    dropConnection(server);

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("keeps trying when the old connection still counts against the network's limit", async () => {
    const { server } = await enterRoom();
    // The server may not have noticed the dropped connection yet, so it still holds a slot.
    server.failNextConnections("too_many_connections");

    dropConnection(server);

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("gives up after the last attempt and returns to the lobby", async () => {
    const { server } = await enterRoom();
    server.failNextConnections("connection", "connection", "connection");

    dropConnection(server);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The connection was lost and could not be restored.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    // The original connection plus exactly three attempts.
    expect(server.createSocket).toHaveBeenCalledTimes(4);
  });

  it("stops immediately when the guest has been banned", async () => {
    const { server } = await enterRoom();
    server.failNextConnections("banned");

    dropConnection(server);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are banned from this chat.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(server.createSocket).toHaveBeenCalledTimes(2);
  });

  it("returns to the lobby with an explanation when the room is full on rejoin", async () => {
    const server = makeFakeServer();
    let joins = 0;
    server.acks["room:join"] = () =>
      joins++ === 0 ? { ok: true } : { ok: false, error: "room_full" };
    await enterRoom(server);

    dropConnection(server);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This room is full.",
    );
    expect(
      screen.getByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    // The connection itself was restored, so another room can be joined without a new nickname.
    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
  });

  it("lets the guest leave while reconnecting and stops trying", async () => {
    const server = makeFakeServer();
    const { user } = await enterRoom(server, [150, 150]);

    dropConnection(server);
    await user.click(screen.getByRole("button", { name: "Leave room" }));

    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.createSocket).toHaveBeenCalledTimes(1);
  });

  it("stops trying when the app unmounts", async () => {
    const server = makeFakeServer();
    const { unmount } = await enterRoom(server, [100, 100]);

    dropConnection(server);
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(server.createSocket).toHaveBeenCalledTimes(1);
  });

  it("does not try to reconnect a guest who was only in the lobby", async () => {
    const { user, server } = await enterRoom();
    await user.click(screen.getByRole("button", { name: "Leave room" }));
    await screen.findByRole("heading", { name: "Public rooms" });

    dropConnection(server);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server.createSocket).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("a connection that keeps failing", () => {
  it("tries again at once when the browser is back online, instead of waiting out the delay", async () => {
    const server = makeFakeServer();
    const { user } = setup(server, [60_000]);
    await joinRoom(user);
    await screen.findByRole("button", { name: "Your profile: Alice" });

    act(() => server.latest.serverEmit("disconnect", "transport close"));
    await screen.findByRole("status");
    expect(server.createSocket).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Your profile: Alice" });
  });

  it("tries again at once when the guest comes back to the tab", async () => {
    const server = makeFakeServer();
    const { user } = setup(server, [60_000]);
    await joinRoom(user);
    await screen.findByRole("button", { name: "Your profile: Alice" });

    act(() => server.latest.serverEmit("disconnect", "transport close"));
    await screen.findByRole("status");

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(server.createSocket).toHaveBeenCalledTimes(2));
  });

  it("keeps trying for a few minutes before giving up", async () => {
    const delays = DEFAULT_RECONNECT_DELAYS_MS;

    expect(delays.reduce((total, delay) => total + delay, 0)).toBeGreaterThan(
      180_000,
    );
    expect(Math.max(...delays)).toBeLessThanOrEqual(30_000);
  });
});
