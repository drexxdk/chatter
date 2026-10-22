import { describe, expect, it } from "vitest";

import { parseAge, readAge } from "./profile";
import { ageFromBirthDate } from "../../../shared/chatProtocol.mjs";

describe("age from date of birth", () => {
  const today = new Date("2026-10-22T00:00:00Z");

  it.each([
    ["1991-10-22", 35],
    ["1991-10-23", 34],
    ["2008-10-22", 18],
    ["1926-10-23", 99],
    ["1988-02-29", 38],
  ])("derives %s as %s years old", (birthDate, age) => {
    expect(ageFromBirthDate(birthDate, today)).toBe(age);
  });

  it.each([
    "2008-10-23",
    "1926-10-22",
    "2027-01-01",
    "1991-02-29",
    "1991-04-31",
    "1991-13-01",
    "1991-1-01",
    "35",
    "",
    null,
    35,
  ])("rejects an invalid or out-of-range date: %s", (birthDate) => {
    expect(ageFromBirthDate(birthDate, today)).toBeUndefined();
  });

  it("advances a leap-day birthday on March 1 in non-leap years", () => {
    expect(
      ageFromBirthDate("2000-02-29", new Date("2026-02-28T23:59:59Z")),
    ).toBe(25);
    expect(
      ageFromBirthDate("2000-02-29", new Date("2026-03-01T00:00:00Z")),
    ).toBe(26);
  });
});

describe("parseAge", () => {
  it.each([18, 30, 99])("accepts %s", (age) => {
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
