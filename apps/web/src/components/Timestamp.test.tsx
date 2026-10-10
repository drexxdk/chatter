import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Timestamp } from "./Timestamp";

const SENT = new Date("2026-10-10T12:00:00.000Z");

describe("Timestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SENT);
  });

  afterEach(() => vi.useRealTimers());

  const later = (seconds: number) =>
    act(() => {
      vi.advanceTimersByTime(seconds * 1000);
    });

  it("tells how long ago, keeps itself up to date, and ends as the time of day", () => {
    render(<Timestamp sentAt={SENT.toISOString()} />);
    const time = screen.getByText("a few seconds ago");
    expect(time).toHaveAttribute("datetime", SENT.toISOString());

    later(60);
    expect(time).toHaveTextContent("1 minute ago");

    later(60);
    expect(time).toHaveTextContent("2 minutes ago");

    later(12 * 60 + 55);
    expect(time).toHaveTextContent("14 minutes ago");

    later(5);
    expect(time).toHaveTextContent(SENT.toLocaleTimeString());
  });

  it("stops its timer when nothing is left to update", () => {
    const { unmount } = render(<Timestamp sentAt={SENT.toISOString()} />);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
