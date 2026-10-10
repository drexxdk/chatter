import { describe, expect, it } from "vitest";

import { ageBucket } from "./age";

const SENT = "2026-10-10T12:00:00.000Z";
const after = (seconds: number) => Date.parse(SENT) + seconds * 1000;

describe("ageBucket", () => {
  it("is a few seconds for the first minute", () => {
    expect(ageBucket(SENT, after(0))).toBe(0);
    expect(ageBucket(SENT, after(59))).toBe(0);
  });

  it("counts whole minutes after that", () => {
    expect(ageBucket(SENT, after(60))).toBe(1);
    expect(ageBucket(SENT, after(119))).toBe(1);
    expect(ageBucket(SENT, after(14 * 60 + 59))).toBe(14);
  });

  it("turns into a clock time at 15 minutes", () => {
    expect(ageBucket(SENT, after(15 * 60))).toBe(-1);
    expect(ageBucket(SENT, after(3 * 3600))).toBe(-1);
  });

  it("treats a time slightly in the future (clock differences) as just now", () => {
    expect(ageBucket(SENT, after(-5))).toBe(0);
  });

  it("falls back to the clock for something that is not a time", () => {
    expect(ageBucket("nonsense", after(0))).toBe(-1);
  });
});
