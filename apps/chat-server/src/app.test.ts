import type { AddressInfo } from "node:net";
import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

const getCachedPublicRooms = vi.hoisted(() => vi.fn());

vi.mock("./rooms.js", () => ({ getCachedPublicRooms }));

import { createApp } from "./app.js";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];

const servers: http.Server[] = [];

async function start(options: Parameters<typeof createApp>[0] = {}) {
  getCachedPublicRooms.mockResolvedValue(ROOMS);

  const server = http.createServer(createApp(options));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  servers.push(server);

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return (path: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { headers });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

describe("routes", () => {
  it("answers the health check", async () => {
    const get = await start();
    const res = await get("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("lists the public rooms", async () => {
    const get = await start();

    expect(await (await get("/rooms")).json()).toEqual(ROOMS);
  });

  it("allows only the configured web origin", async () => {
    const get = await start();

    const allowed = await get("/rooms", { Origin: "http://localhost:5173" });
    const other = await get("/rooms", { Origin: "https://evil.example.com" });

    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    // The header always names the configured origin, so a browser on any other site refuses the answer.
    expect(other.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
  });
});

describe("security headers", () => {
  it("sets the standard hardening headers and hides the framework", async () => {
    const get = await start();
    const { headers } = await get("/rooms");

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(headers.get("strict-transport-security")).toBeTruthy();
    expect(headers.get("x-powered-by")).toBeNull();
  });

  it("also covers unknown routes", async () => {
    const get = await start();
    const res = await get("/nope");

    expect(res.status).toBe(404);
    expect(res.headers.get("content-security-policy")).toBeTruthy();
  });
});

describe("rate limit on /rooms", () => {
  const limit = { max: 3, windowMs: 60_000 };

  it("answers 429 with Retry-After once the limit is used up", async () => {
    const get = await start({ roomsRateLimit: limit });

    for (let i = 0; i < limit.max; i++) {
      expect((await get("/rooms")).status).toBe(200);
    }

    const blocked = await get("/rooms");

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("reports the remaining allowance on every answer", async () => {
    const get = await start({ roomsRateLimit: limit });
    const res = await get("/rooms");

    expect(res.headers.get("ratelimit")).toMatch(/remaining=2/);
  });

  it("never limits the health check", async () => {
    const get = await start({ roomsRateLimit: limit });

    for (let i = 0; i < limit.max + 3; i++) {
      expect((await get("/health")).status).toBe(200);
    }
  });

  // Without a trusted proxy the header is client-controlled, so it must not buy a fresh allowance.
  it("ignores X-Forwarded-For when no proxy is trusted", async () => {
    const get = await start({ roomsRateLimit: limit, trustedProxyHops: 0 });

    for (let i = 0; i < limit.max; i++) {
      await get("/rooms", { "X-Forwarded-For": `203.0.113.${i}` });
    }

    const res = await get("/rooms", { "X-Forwarded-For": "198.51.100.77" });

    expect(res.status).toBe(429);
  });

  it("counts clients separately behind a trusted proxy", async () => {
    const get = await start({ roomsRateLimit: limit, trustedProxyHops: 1 });
    const from = (ip: string) => ({ "X-Forwarded-For": ip });

    for (let i = 0; i < limit.max; i++) {
      await get("/rooms", from("203.0.113.1"));
    }

    expect((await get("/rooms", from("203.0.113.1"))).status).toBe(429);
    expect((await get("/rooms", from("203.0.113.2"))).status).toBe(200);
  });

  it("uses the address the proxy appended, not one the client made up", async () => {
    const get = await start({ roomsRateLimit: limit, trustedProxyHops: 1 });

    for (let i = 0; i < limit.max; i++) {
      await get("/rooms", { "X-Forwarded-For": `1.1.1.${i}, 203.0.113.9` });
    }

    const res = await get("/rooms", {
      "X-Forwarded-For": "2.2.2.2, 203.0.113.9",
    });

    expect(res.status).toBe(429);
  });
});
