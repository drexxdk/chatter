import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeMember } from "./adminRooms.js";
import { createCrowd, type CrowdState } from "./crowd.js";

vi.mock("./log.js", () => ({ log: { error: vi.fn() } }));

const SLUG = "admin-lab";

function setup(options: { seats?: number } = {}) {
  const fakes = new Map<string, FakeMember[]>();
  const states: CrowdState[] = [];
  const host = {
    fakes,
    seatsLeft: vi.fn(async () => options.seats ?? Infinity),
    say: vi.fn(async (_slug: string, _who: FakeMember, _text: string) => {}),
    react: vi.fn(
      async (
        _slug: string,
        _who: FakeMember,
        _messageId: string,
        _emoji: string,
      ) => {},
    ),
    joined: vi.fn(async () => {}),
    left: vi.fn(async () => {}),
    changed: vi.fn((_slug: string, state: CrowdState) => {
      states.push(state);
    }),
  };

  return { crowd: createCrowd(host, { rampMs: 0 }), host, fakes, states };
}

// Lets what the crowd does in the background finish.
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the crowd of a test room", () => {
  it("brings in as many people as asked, and tells the room each time", async () => {
    const { crowd, host, fakes } = setup();

    await crowd.start(SLUG, 5);
    await settle();

    expect(fakes.get(SLUG)).toHaveLength(5);
    expect(host.joined).toHaveBeenCalledTimes(5);
    expect(crowd.state(SLUG)).toEqual({
      status: "running",
      people: 5,
      target: 5,
    });
  });

  it("makes people with a name, a picture and an avatar, no two with the same name", async () => {
    const { crowd, fakes } = setup();

    await crowd.start(SLUG, 30);
    await settle();

    const people = fakes.get(SLUG) ?? [];
    const names = people.map((person) => person.nickname.toLowerCase());

    expect(new Set(names).size).toBe(30);
    for (const person of people) {
      expect(person.guestId).toMatch(/^fake-/);
      expect(person.picture).toMatch(/^[a-z-]+:[a-z0-9]{6,16}$/);
    }
  });

  it("stops at the seats there are in the room", async () => {
    const { crowd, fakes, host } = setup();
    let seats = 3;

    host.seatsLeft.mockImplementation(async () => seats);
    host.joined.mockImplementation(async () => {
      seats -= 1;
    });

    await crowd.start(SLUG, 10);
    await settle();

    expect(fakes.get(SLUG)).toHaveLength(3);
    expect(crowd.state(SLUG)).toMatchObject({ people: 3, target: 10 });
  });

  it("refuses to start in a room with no seat left", async () => {
    const { crowd } = setup({ seats: 0 });

    expect(await crowd.start(SLUG, 5)).toBe("room_full");
    expect(crowd.state(SLUG).status).toBe("stopped");
  });

  it("writes by itself, and stops writing while paused", async () => {
    const { crowd, host } = setup();

    await crowd.start(SLUG, 20);
    await settle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(host.say.mock.calls.length).toBeGreaterThan(0);

    crowd.pause(SLUG);
    expect(crowd.state(SLUG).status).toBe("paused");
    host.say.mockClear();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(host.say).not.toHaveBeenCalled();

    crowd.resume(SLUG);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(host.say.mock.calls.length).toBeGreaterThan(0);
  });

  it("writes as the people it made, in the room", async () => {
    const { crowd, host, fakes } = setup();

    await crowd.start(SLUG, 10);
    await settle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    const [slug, who, text] = host.say.mock.calls[0] as unknown as [
      string,
      FakeMember,
      string,
    ];

    expect(slug).toBe(SLUG);
    expect(fakes.get(SLUG)).toContain(who);
    expect(text.length).toBeGreaterThan(0);
  });

  it("changes how many there are while it runs", async () => {
    const { crowd, fakes, host } = setup();

    await crowd.start(SLUG, 6);
    await settle();
    await crowd.setPeople(SLUG, 2);

    expect(fakes.get(SLUG)).toHaveLength(2);
    expect(host.left).toHaveBeenCalledTimes(4);

    await crowd.setPeople(SLUG, 4);
    await settle();

    expect(fakes.get(SLUG)).toHaveLength(4);
    expect(crowd.state(SLUG)).toMatchObject({ people: 4, target: 4 });
  });

  it("sends everybody away when stopped, and writes no more", async () => {
    const { crowd, host, fakes } = setup();

    await crowd.start(SLUG, 8);
    await settle();
    await crowd.stop(SLUG);

    expect(fakes.get(SLUG)).toEqual([]);
    expect(host.left).toHaveBeenCalledTimes(8);
    expect(crowd.state(SLUG)).toEqual({
      status: "stopped",
      people: 0,
      target: 0,
    });

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(host.say).not.toHaveBeenCalled();
  });

  it("leaves what the admin added by hand when stopped", async () => {
    const { crowd, fakes } = setup();
    const byHand = { guestId: "fake-hand", nickname: "Hand" } as FakeMember;

    fakes.set(SLUG, [byHand]);
    await crowd.start(SLUG, 3);
    await settle();
    await crowd.stop(SLUG);

    expect(fakes.get(SLUG)).toEqual([byHand]);
  });

  it("only answers when it is not stopped or paused, and answers somebody who names a person", async () => {
    const { crowd, host, fakes } = setup();

    await crowd.start(SLUG, 60);
    await settle();
    // Every person who is not a lurker answers three times out of four, so with this many somebody does.
    const named = (fakes.get(SLUG) ?? []).map(
      (person) => `@${person.nickname}`,
    );

    crowd.heard(SLUG, {
      id: "m1",
      guestId: "guest-real",
      nickname: "Ada",
      role: "moderator",
      text: named.join(" "),
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(
      host.say.mock.calls.some(([, , text]) =>
        (text as string).startsWith("@Ada "),
      ),
    ).toBe(true);
  });

  it("reacts to what is written, and not while paused", async () => {
    const { crowd, host } = setup();

    await crowd.start(SLUG, 200);
    await settle();
    crowd.pause(SLUG);

    for (let i = 0; i < 20; i++) {
      crowd.heard(SLUG, {
        id: `m${i}`,
        guestId: "guest-real",
        nickname: "Ada",
        role: "guest",
        text: "hello",
      });
    }
    await vi.advanceTimersByTimeAsync(60_000);

    expect(host.react).not.toHaveBeenCalled();

    crowd.resume(SLUG);
    for (let i = 0; i < 20; i++) {
      crowd.heard(SLUG, {
        id: `n${i}`,
        guestId: "guest-real",
        nickname: "Ada",
        role: "guest",
        text: "hello",
      });
    }
    await vi.advanceTimersByTimeAsync(60_000);

    expect(host.react.mock.calls.length).toBeGreaterThan(0);
    expect(host.react.mock.calls[0]?.[2]).toMatch(/^n\d+$/);
  });

  it("forgets somebody who was taken away by hand, and nobody when the room empties", async () => {
    const { crowd, fakes } = setup();

    await crowd.start(SLUG, 3);
    await settle();
    const [first] = fakes.get(SLUG) ?? [];

    crowd.release(SLUG, first?.guestId ?? "");

    expect(crowd.state(SLUG).people).toBe(2);

    crowd.discard(SLUG);

    expect(crowd.state(SLUG).status).toBe("stopped");
  });

  it("answers a command for a crowd that is not there", async () => {
    const { crowd } = setup();

    expect(crowd.pause(SLUG)).toBe("not_running");
    expect(crowd.resume(SLUG)).toBe("not_running");
    expect(await crowd.setPeople(SLUG, 3)).toBe("not_running");
  });
});
