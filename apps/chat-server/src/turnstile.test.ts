import { afterEach, describe, expect, it, vi } from "vitest";
import { createHumanCheck } from "./turnstile.js";

const verify = createHumanCheck({
  secret: "private-test-secret",
  hostname: "chat.example.com",
});
const valid = {
  success: true,
  hostname: "chat.example.com",
  action: "guest_join",
};
afterEach(() => vi.unstubAllGlobals());

describe("human verification", () => {
  it("only accepts Cloudflare's dummy metadata when test keys are explicitly allowed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, hostname: "localhost", action: "test" }),
      ),
    );
    const options = {
      secret: "1x0000000000000000000000000000000AA",
      hostname: "chat.example.com",
    };
    expect(await createHumanCheck(options)("dummy-token", "guest_join")).toBe(
      "human_check_failed",
    );
    expect(
      await createHumanCheck({ ...options, allowTestKeys: true })(
        "dummy-token",
        "guest_join",
      ),
    ).toBeUndefined();
  });
  it("does not contact Cloudflare when not configured", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(
      await createHumanCheck({ hostname: "localhost" })(
        undefined,
        "guest_join",
      ),
    ).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "", 1, "x".repeat(2049)])(
    "refuses missing or malformed tokens: %s",
    async (token) => {
      const request = vi.fn();
      vi.stubGlobal("fetch", request);
      expect(await verify(token, "guest_join")).toBe("human_check_required");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("verifies with Cloudflare and sends the trusted client IP", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json(valid));
    vi.stubGlobal("fetch", request);
    expect(
      await verify("single-use-token", "guest_join", "192.0.2.1"),
    ).toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    const body = new URLSearchParams(
      request.mock.calls[0]![1]!.body as URLSearchParams,
    );
    expect(Object.fromEntries(body)).toEqual({
      secret: "private-test-secret",
      response: "single-use-token",
      remoteip: "192.0.2.1",
    });
  });
  it.each([
    { ...valid, success: false, "error-codes": ["timeout-or-duplicate"] },
    { ...valid, hostname: "attacker.example.com" },
    { ...valid, action: "password_login" },
  ])("refuses rejected, replayed or mismatched challenges", async (result) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(result)),
    );
    expect(await verify("token", "guest_join")).toBe("human_check_failed");
  });
  it.each(["http", "network", "json"])(
    "fails closed on %s failures",
    async (failure) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (failure === "network") throw new Error("network");
          return failure === "http"
            ? new Response(null, { status: 503 })
            : new Response("invalid-json");
        }),
      );
      expect(await verify("token", "guest_join")).toBe("unavailable");
    },
  );
});
