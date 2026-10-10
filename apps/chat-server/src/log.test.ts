import { afterEach, describe, expect, it, vi } from "vitest";

import { log } from "./log.js";

afterEach(() => vi.restoreAllMocks());

describe("logging", () => {
  it("writes an error as one JSON line with the cause and its stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.error("Ban check failed", new Error("redis down"), { room: "general" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      level: "error",
      message: "Ban check failed",
      room: "general",
      error: { name: "Error", message: "redis down" },
    });
    expect(line.error.stack).toContain("redis down");
    expect(new Date(line.time).toISOString()).toBe(line.time);
  });

  it("keeps whatever was thrown when it is not an Error, and leaves it out when there is none", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.error("A string was thrown", "boom");
    log.error("Nothing was thrown");

    expect(JSON.parse(spy.mock.calls[0]![0] as string).error).toBe("boom");
    expect(JSON.parse(spy.mock.calls[1]![0] as string)).not.toHaveProperty(
      "error",
    );
  });

  it("writes information to the standard output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    log.info("listening", { port: 4000 });

    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({
      level: "info",
      message: "listening",
      port: 4000,
    });
  });
});
