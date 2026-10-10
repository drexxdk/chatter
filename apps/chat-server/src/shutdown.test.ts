import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createShutdown, SHUTDOWN_TIMEOUT_MS } from "./shutdown.js";

function setup(
  overrides: {
    close?: () => Promise<void>;
    quit?: () => Promise<unknown>;
  } = {},
) {
  const order: string[] = [];
  const exit = vi.fn((code: number) => void order.push(`exit ${code}`));
  const timer = setInterval(() => {}, 1_000_000);
  const clearSpy = vi.spyOn(globalThis, "clearInterval");
  const io = {
    close: vi.fn(
      overrides.close ??
        (async () => {
          order.push("io closed");
        }),
    ),
  };
  const client = () => ({
    quit: vi.fn(
      overrides.quit ??
        (async () => {
          order.push("redis quit");
        }),
    ),
    disconnect: vi.fn(),
  });
  const clients = [client(), client()];
  const shutdown = createShutdown({
    io,
    timers: [timer],
    redisClients: clients,
    exit,
    log: () => {},
  });

  return { shutdown, io, clients, exit, order, timer, clearSpy };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shutting down", () => {
  it("stops the syncs, closes the clients' connections, then Redis, then exits cleanly", async () => {
    const { shutdown, order, clearSpy, timer, clients } = setup();

    await shutdown("SIGTERM");

    expect(clearSpy).toHaveBeenCalledWith(timer);
    expect(order).toEqual(["io closed", "redis quit", "redis quit", "exit 0"]);
    expect(
      clients.every((client) => client.disconnect.mock.calls.length === 0),
    ).toBe(true);
  });

  it("does it once, however many signals arrive", async () => {
    const { shutdown, io, exit } = setup();

    await Promise.all([shutdown("SIGINT"), shutdown("SIGINT")]);
    await shutdown("SIGTERM");

    expect(io.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("still closes Redis and exits with an error when the socket server fails to close", async () => {
    const { shutdown, exit, clients } = setup({
      close: () => Promise.reject(new Error("boom")),
    });

    await shutdown("SIGTERM");

    expect(clients.every((client) => client.quit.mock.calls.length === 1)).toBe(
      true,
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("disconnects a Redis client that cannot quit", async () => {
    const { shutdown, exit, clients } = setup({
      quit: () => Promise.reject(new Error("connection closed")),
    });

    await shutdown("SIGTERM");

    expect(
      clients.every((client) => client.disconnect.mock.calls.length === 1),
    ).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits anyway when closing takes too long", async () => {
    vi.useFakeTimers();
    const { shutdown, exit } = setup({ close: () => new Promise(() => {}) });

    void shutdown("SIGTERM");
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);

    expect(exit).toHaveBeenCalledWith(1);
  });
});
