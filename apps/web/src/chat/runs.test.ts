import { describe, expect, it } from "vitest";

import { runs } from "./runs";

const by = (item: string) => (item === "-" ? undefined : item[0]);

describe("runs", () => {
  it("puts consecutive items by the same author together", () => {
    expect(runs(["a1", "a2", "b1", "a3"], by)).toEqual([
      ["a1", "a2"],
      ["b1"],
      ["a3"],
    ]);
  });

  it("keeps an item with no author on its own, and it ends the run", () => {
    expect(runs(["a1", "-", "a2", "-", "-", "a3", "a4"], by)).toEqual([
      ["a1"],
      ["-"],
      ["a2"],
      ["-"],
      ["-"],
      ["a3", "a4"],
    ]);
  });

  it("is empty for nothing", () => {
    expect(runs([], by)).toEqual([]);
  });
});
