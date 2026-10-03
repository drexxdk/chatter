import { describe, expect, it } from "vitest";

import { optionalPositiveInt, positiveIntOrDefault } from "./env.js";

describe("positiveIntOrDefault", () => {
  const FIFTEEN_MINUTES = 900_000;

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("uses the default when %s", (_label, raw) => {
    expect(
      positiveIntOrDefault("INACTIVITY_TIMEOUT_MS", raw, FIFTEEN_MINUTES),
    ).toBe(FIFTEEN_MINUTES);
  });

  it("reads a positive whole number", () => {
    expect(positiveIntOrDefault("INACTIVITY_TIMEOUT_MS", "5000", 1)).toBe(5000);
  });

  // 0 used to mean "never time out"; a magic value like that, or a typo, must not quietly switch the check off.
  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["fractional", "1.5"],
    ["words", "never"],
    ["a duration", "15m"],
  ])("rejects %s and names the setting and the default", (_label, raw) => {
    expect(() =>
      positiveIntOrDefault("INACTIVITY_TIMEOUT_MS", raw, FIFTEEN_MINUTES),
    ).toThrow(
      /INACTIVITY_TIMEOUT_MS.*positive whole number.*default of 900000/,
    );
  });
});

describe("optionalPositiveInt", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("means no limit when %s", (_label, raw) => {
    expect(optionalPositiveInt("MAX_CONNECTIONS_PER_IP", raw)).toBeUndefined();
  });

  it("reads a positive whole number", () => {
    expect(optionalPositiveInt("MAX_CONNECTIONS_PER_IP", "10")).toBe(10);
    expect(optionalPositiveInt("MAX_CONNECTIONS_PER_IP", " 1 ")).toBe(1);
  });

  // A typo must stop the server, not quietly switch the protection off.
  it.each([
    ["zero", "0"],
    ["negative", "-3"],
    ["fractional", "2.5"],
    ["words", "ten"],
    ["trailing text", "10 per ip"],
    ["infinity", "Infinity"],
  ])("rejects %s and names the setting", (_label, raw) => {
    expect(() => optionalPositiveInt("MAX_CONNECTIONS_PER_IP", raw)).toThrow(
      /MAX_CONNECTIONS_PER_IP.*positive whole number/,
    );
  });
});
