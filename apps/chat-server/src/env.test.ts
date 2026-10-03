import { describe, expect, it } from "vitest";

import {
  nonNegativeIntOrDefault,
  optionalPositiveInt,
  portOrDefault,
  positiveIntOrDefault,
} from "./env.js";

describe("nonNegativeIntOrDefault", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("uses the default when %s", (_label, raw) => {
    expect(nonNegativeIntOrDefault("TRUST_PROXY_HOPS", raw, 0)).toBe(0);
    expect(nonNegativeIntOrDefault("TRUST_PROXY_HOPS", raw, 2)).toBe(2);
  });

  // 0 is a real value here: no proxy in front of the server.
  it("accepts zero and positive whole numbers", () => {
    expect(nonNegativeIntOrDefault("TRUST_PROXY_HOPS", "0", 1)).toBe(0);
    expect(nonNegativeIntOrDefault("TRUST_PROXY_HOPS", "2", 0)).toBe(2);
  });

  it.each([
    ["negative", "-1"],
    ["fractional", "1.5"],
    ["words", "one"],
    ["infinity", "Infinity"],
  ])("rejects %s and names the setting and the default", (_label, raw) => {
    expect(() => nonNegativeIntOrDefault("TRUST_PROXY_HOPS", raw, 0)).toThrow(
      /TRUST_PROXY_HOPS.*whole number.*0 or more.*default of 0/,
    );
  });
});

describe("portOrDefault", () => {
  it("uses the default when unset or empty", () => {
    expect(portOrDefault("PORT", undefined, 4000)).toBe(4000);
    expect(portOrDefault("PORT", "", 4000)).toBe(4000);
  });

  it("accepts ports from 1 to 65535", () => {
    expect(portOrDefault("PORT", "1", 4000)).toBe(1);
    expect(portOrDefault("PORT", "65535", 4000)).toBe(65535);
  });

  it.each([
    ["zero", "0"],
    ["too large", "65536"],
    ["negative", "-1"],
    ["fractional", "40.5"],
    ["words", "four"],
  ])("rejects %s and names the setting", (_label, raw) => {
    expect(() => portOrDefault("PORT", raw, 4000)).toThrow(
      /PORT.*whole number from 1 to 65535.*default of 4000/,
    );
  });
});

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
      /INACTIVITY_TIMEOUT_MS.*whole number of 1 or more.*default of 900000/,
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
      /MAX_CONNECTIONS_PER_IP.*whole number of 1 or more/,
    );
  });
});
