import { describe, expect, it } from "vitest";

import { withMemberNamesLock } from "./memberNamesLock.js";

describe("account name mutations", () => {
  it("serializes overlapping operations until the first write finishes", async () => {
    let markEntered!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const order: string[] = [];

    const first = withMemberNamesLock(async () => {
      order.push("first started");
      markEntered();
      await finished;
      order.push("first finished");
      return 1;
    });
    await entered;

    const second = withMemberNamesLock(async () => {
      order.push("second started");
      return 2;
    });

    try {
      await Promise.resolve();
      expect(order).toEqual(["first started"]);
    } finally {
      finish();
    }

    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual([
      "first started",
      "first finished",
      "second started",
    ]);
  });

  it("propagates failures without blocking subsequent operations", async () => {
    const failure = new Error("write failed");
    const first = withMemberNamesLock(async () => {
      throw failure;
    });
    const second = withMemberNamesLock(async () => "saved");

    await expect(first).rejects.toBe(failure);
    await expect(second).resolves.toBe("saved");
  });
});
