import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTyping } from "./useTyping";
import { TYPING_TTL_MS } from "../../../../shared/chatProtocol.mjs";

function setup() {
  const emit = vi.fn();
  const blocked: string[] = [];
  const socketRef = { current: { emit, on: vi.fn(), disconnect: vi.fn() } };
  const roomRef = { current: "general" };
  const ownGuestIdsRef = { current: ["me"] };
  const getBlockedGuestIds = () => blocked;
  return {
    ...renderHook(() =>
      useTyping({ socketRef, roomRef, ownGuestIdsRef, getBlockedGuestIds }),
    ),
    emit,
    blocked,
    roomRef,
  };
}

describe("typing activity", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ignores other rooms, private activity for other recipients, ourselves, and blocked people", () => {
    const { result, blocked } = setup();
    blocked.push("blocked");
    act(() => {
      for (const notice of [
        { guestId: "other", roomSlug: "random" },
        { guestId: "other", toGuestId: "someone-else" },
        { guestId: "me", roomSlug: "general" },
        { guestId: "blocked", toGuestId: "me" },
      ])
        result.current.receive({ nickname: "Writer", active: true, ...notice });
    });
    expect(result.current.writers).toEqual([]);
  });

  it("tracks room and private writers, expires stale activity, and respects explicit stops", () => {
    const { result } = setup();
    const room = {
      guestId: "alice",
      nickname: "Alice",
      roomSlug: "general",
      active: true,
    };
    const direct = {
      guestId: "bob",
      nickname: "Bob",
      toGuestId: "me",
      active: true,
    };
    act(() => {
      result.current.receive(room);
      result.current.receive(direct);
    });
    expect(result.current.writers).toHaveLength(2);
    act(() => result.current.receive({ ...room, active: false }));
    expect(result.current.writers).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.writers.map((writer) => writer.nickname)).toEqual([
      "Bob",
    ]);
    act(() => vi.advanceTimersByTime(TYPING_TTL_MS));
    expect(result.current.writers).toEqual([]);
  });

  it("keeps writer order stable across refreshes and smooths short stop-start bursts", () => {
    const { result } = setup();
    const alice = {
      guestId: "alice",
      nickname: "Alice",
      active: true,
      roomSlug: "general",
    };
    const bob = {
      guestId: "bob",
      nickname: "Bob",
      active: true,
      roomSlug: "general",
    };
    act(() => {
      result.current.receive(alice);
      result.current.receive(bob);
      result.current.receive(alice);
    });
    expect(result.current.writers.map((writer) => writer.nickname)).toEqual([
      "Alice",
      "Bob",
    ]);
    act(() => result.current.receive({ ...alice, active: false }));
    act(() => vi.advanceTimersByTime(600));
    act(() => result.current.receive(alice));
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.writers.map((writer) => writer.nickname)).toEqual([
      "Alice",
      "Bob",
    ]);
    act(() => result.current.receive({ ...alice, active: false }));
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.writers).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.writers.map((writer) => writer.nickname)).toEqual([
      "Bob",
    ]);
  });

  it.each([{ roomSlug: "general" }, { toGuestId: "me" }])(
    "clears a message sender immediately during the stop grace period for %j",
    (audience) => {
      const { result } = setup();
      const alice = { guestId: "alice", nickname: "Alice", ...audience };
      act(() => {
        result.current.receive({ ...alice, active: true });
        result.current.receive({
          guestId: "bob",
          nickname: "Bob",
          roomSlug: "general",
          active: true,
        });
        result.current.receive({ ...alice, active: false });
      });
      expect(result.current.writers).toHaveLength(2);
      act(() => result.current.clearWriter("alice", audience));
      expect(result.current.writers.map((writer) => writer.nickname)).toEqual([
        "Bob",
      ]);
    },
  );

  it("does not clear typing for a newer audience when an older message arrives", () => {
    const { result } = setup();
    act(() => {
      result.current.receive({
        guestId: "alice",
        nickname: "Alice",
        toGuestId: "me",
        active: true,
      });
      result.current.clearWriter("alice", { roomSlug: "general" });
    });
    expect(result.current.writers).toHaveLength(1);
  });

  it("clears immediately on reset even when a stop grace period is pending", () => {
    const { result } = setup();
    const writer = { guestId: "alice", nickname: "Alice", roomSlug: "general" };
    act(() => {
      result.current.receive({ ...writer, active: true });
      result.current.receive({ ...writer, active: false });
      result.current.reset();
    });
    expect(result.current.writers).toEqual([]);
    act(() => vi.advanceTimersByTime(TYPING_TTL_MS));
    expect(result.current.writers).toEqual([]);
  });

  it("throttles keystrokes, stops the previous recipient, and ends activity after a pause", () => {
    const { result, emit } = setup();
    act(() => {
      result.current.update(true);
      result.current.update(true);
    });
    expect(emit).toHaveBeenCalledTimes(1);
    act(() => result.current.update(true, "bob"));
    expect(emit.mock.calls.slice(-2)).toEqual([
      ["chat:typing", { active: false }],
      ["chat:typing", { active: true, toGuestId: "bob" }],
    ]);
    act(() => vi.advanceTimersByTime(TYPING_TTL_MS));
    expect(emit).toHaveBeenLastCalledWith("chat:typing", { active: false });
  });

  it("refreshes expiry and ignores a stop for the writer's previous audience", () => {
    const { result } = setup();
    const writer = { guestId: "bob", nickname: "Bob", active: true };
    act(() => result.current.receive({ ...writer, roomSlug: "general" }));
    act(() => result.current.receive({ ...writer, toGuestId: "me" }));
    act(() =>
      result.current.receive({ ...writer, roomSlug: "general", active: false }),
    );
    expect(result.current.writers).toHaveLength(1);
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.receive({ ...writer, toGuestId: "me" }));
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.writers).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.writers).toEqual([]);
  });
});
