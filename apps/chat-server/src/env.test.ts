import { describe, expect, it } from "vitest";

import { optionalPositiveInt } from "./env.js";

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
