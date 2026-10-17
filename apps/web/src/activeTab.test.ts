import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTabCoordinator, type Channel } from "./activeTab";

// What BroadcastChannel does: a message goes to every other channel on the same name, a moment later.
class Bus {
  channels = new Set<FakeChannel>();

  open() {
    return new FakeChannel(this);
  }
}

class FakeChannel implements Channel {
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(private bus: Bus) {
    bus.channels.add(this);
  }

  postMessage(message: unknown) {
    for (const other of this.bus.channels) {
      if (other !== this) {
        queueMicrotask(() => other.onmessage?.({ data: message }));
      }
    }
  }

  close() {
    this.bus.channels.delete(this);
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0);

function tabs(count: number) {
  const bus = new Bus();

  return Array.from({ length: count }, () =>
    createTabCoordinator(() => bus.open()),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tabs that agree on who is in a room", () => {
  it("finds nobody in a room when nobody is", async () => {
    const [a] = tabs(2);

    await flush();

    expect(await a?.otherInRoom()).toBe(false);
  });

  it("knows that another tab is in a room, once it has said so", async () => {
    const [a, b] = tabs(2);

    a?.setInRoom(true);
    await flush();

    const asked = b?.otherInRoom();
    await flush();

    expect(await asked).toBe(true);
    expect(await a?.otherInRoom()).toBe(false);
  });

  it("knows about a room that was entered before it opened", async () => {
    const bus = new Bus();
    const a = createTabCoordinator(() => bus.open());

    a.setInRoom(true);
    await flush();
    const b = createTabCoordinator(() => bus.open());
    await flush();

    const asked = b.otherInRoom();
    await flush();

    expect(await asked).toBe(true);
  });

  it("finds the room free when the tab that was in it has left", async () => {
    const [a, b] = tabs(2);

    a?.setInRoom(true);
    await flush();
    a?.setInRoom(false);
    await flush();

    expect(await b?.otherInRoom()).toBe(false);
  });

  it("does not take a tab that is gone for being in a room", async () => {
    const bus = new Bus();
    const a = createTabCoordinator(() => bus.open());
    const b = createTabCoordinator(() => bus.open());

    a.setInRoom(true);
    await flush();
    // Gone without a word, as when the browser is closed.
    bus.channels.forEach((channel) => {
      if (channel.onmessage && channel !== [...bus.channels][1]) {
        channel.onmessage = null;
      }
    });

    const asked = b.otherInRoom();
    await vi.advanceTimersByTimeAsync(1000);

    expect(await asked).toBe(false);
  });

  it("tells the tab that is in a room to leave it when another takes over", async () => {
    const [a, b] = tabs(2);
    const left = vi.fn();

    a?.onDisplaced(left);
    a?.setInRoom(true);
    await flush();
    b?.claim();
    await flush();

    expect(left).toHaveBeenCalledTimes(1);
    // It is no longer in a room as far as anybody asking is concerned.
    expect(await b?.otherInRoom()).toBe(false);
  });

  it("does not disturb a tab that is not in a room when another takes over", async () => {
    const [a, b] = tabs(2);
    const left = vi.fn();

    a?.onDisplaced(left);
    b?.claim();
    await flush();

    expect(left).not.toHaveBeenCalled();
  });

  it("leaves exactly one of two tabs in a room when they enter at the same time", async () => {
    const [a, b] = tabs(2);
    const displaced = vi.fn();

    a?.onDisplaced(() => displaced("a"));
    b?.onDisplaced(() => displaced("b"));
    a?.setInRoom(true);
    b?.setInRoom(true);
    await flush();

    expect(displaced).toHaveBeenCalledTimes(1);
  });

  it("stops listening when asked to", async () => {
    const [a, b] = tabs(2);
    const left = vi.fn();

    const stop = a?.onDisplaced(left);
    a?.setInRoom(true);
    await flush();
    stop?.();
    b?.claim();
    await flush();

    expect(left).not.toHaveBeenCalled();
  });

  it("is always alone where the browser has no channel", async () => {
    const lonely = createTabCoordinator(() => null);

    lonely.setInRoom(true);
    lonely.claim();

    expect(await lonely.otherInRoom()).toBe(false);
  });
});
