import { describe, expect, it } from "vitest";

import { clockFor, formatClock } from "./clock";

const AT = "2026-10-10T13:05:09.000Z";

describe("which clock a guest gets", () => {
  it("is the 12-hour clock for an American browser in an American time zone", () => {
    expect(clockFor("en", ["en-US", "en"], "America/New_York")).toEqual({
      locale: "en-US",
    });
  });

  it("is the 24-hour clock for a browser whose own locale uses one", () => {
    expect(clockFor("en", ["en-GB", "en"], "Europe/London")).toEqual({
      locale: "en-GB",
    });
  });

  it("is the 24-hour clock when the browser also lists an English of a 24-hour country, as in Denmark", () => {
    expect(
      clockFor("en", ["en-US", "en-DK", "en-GB"], "America/New_York"),
    ).toEqual({ locale: "en-DK" });
  });

  it("is the 24-hour clock in a European or African time zone, whatever the browser says", () => {
    expect(clockFor("en", ["en-US", "en"], "Europe/Copenhagen")).toEqual({
      locale: "en-US",
      hourCycle: "h23",
    });
    expect(clockFor("en", ["en-US"], "Africa/Nairobi").hourCycle).toBe("h23");
  });

  it("keeps the 12-hour clock in other time zones", () => {
    expect(clockFor("en", ["en-US"], "Asia/Manila").hourCycle).toBeUndefined();
    expect(clockFor("en", ["en-US"], undefined).hourCycle).toBeUndefined();
  });

  it("follows the chat's language when it is not English", () => {
    expect(clockFor("da", ["en-US"], "America/New_York")).toEqual({
      locale: "da",
    });
    expect(clockFor("de", ["en-US"], "America/New_York")).toEqual({
      locale: "de",
    });
  });
});

describe("a time of day", () => {
  const american = () =>
    formatClock(AT, "en", ["en-US", "en"], "America/New_York");

  it("has AM or PM only where the clock is a 12-hour one", () => {
    expect(american()).toMatch(/[AP]M/);
    expect(formatClock(AT, "da", ["en-US"], "Europe/Copenhagen")).not.toMatch(
      /[AP]M/i,
    );
    expect(
      formatClock(AT, "en", ["en-US", "en-DK"], "Europe/Copenhagen"),
    ).not.toMatch(/[AP]M/i);
    expect(formatClock(AT, "en", ["en-US"], "Europe/Copenhagen")).not.toMatch(
      /[AP]M/i,
    );
  });
});
