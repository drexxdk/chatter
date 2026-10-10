import { describe, expect, it } from "vitest";

import { parseAge, readAge } from "./profile";

describe("parseAge", () => {
  it.each([18, 30, 120])("accepts %s", (age) => {
    expect(parseAge(age)).toBe(age);
  });

  it.each([12, 121, 0, -5, 20.5, "30", null, undefined, Number.NaN])(
    "does not accept %s",
    (value) => {
      expect(parseAge(value)).toBeUndefined();
    },
  );
});

describe("readAge", () => {
  it("takes an empty box to mean no age", () => {
    expect(readAge("")).toEqual({ ok: true });
    expect(readAge("   ")).toEqual({ ok: true });
  });

  it("reads a whole number in range, spaces around it ignored", () => {
    expect(readAge(" 27 ")).toEqual({ ok: true, age: 27 });
  });

  it.each(["12", "17", "121", "abc", "2.5", "-30", "1e2", "0030x"])(
    "refuses %s",
    (text) => {
      expect(readAge(text)).toEqual({ ok: false });
    },
  );
});
