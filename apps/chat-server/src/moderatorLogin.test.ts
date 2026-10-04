import type { AddressInfo } from "node:net";
import http from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loginAccount } = vi.hoisted(() => ({ loginAccount: vi.fn() }));

vi.mock("./rooms.js", () => ({ getCachedPublicRooms: vi.fn() }));
vi.mock("./payloadClient.js", () => ({ loginAccount }));

import { createApp } from "./app.js";
import { verifyToken } from "./tokens.js";

const SECRET = "a-secret-that-is-long-enough-for-tests";
const servers: http.Server[] = [];

async function start(options: Parameters<typeof createApp>[0] = {}) {
  const server = http.createServer(
    createApp({ authTokenSecret: SECRET, ...options }),
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  servers.push(server);

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return (
    body: unknown,
    init: { headers?: Record<string, string>; raw?: boolean } = {},
  ) =>
    fetch(`${base}/moderator/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...init.headers },
      body: init.raw ? (body as string) : JSON.stringify(body),
    });
}

const credentials = { email: "ada@example.com", password: "correct horse" };
const account = { id: 7, role: "moderator", displayName: "Ada Mod" };

beforeEach(() => {
  loginAccount.mockReset().mockResolvedValue(account);
});

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

describe("POST /moderator/login", () => {
  it("signs a moderator in with a token for the account's chat name", async () => {
    const login = await start();
    const res = await login(credentials);
    const body = (await res.json()) as {
      token: string;
      expiresAt: number;
    };

    expect(res.status).toBe(200);
    expect(loginAccount).toHaveBeenCalledWith(
      credentials.email,
      credentials.password,
    );
    expect(body).toMatchObject({ name: "Ada Mod", role: "moderator" });
    expect(verifyToken(body.token, { secret: SECRET })).toMatchObject({
      sub: 7,
      name: "Ada Mod",
      role: "moderator",
    });
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("lets a super-admin in as a moderator", async () => {
    loginAccount.mockResolvedValue({ ...account, role: "super-admin" });
    const login = await start();

    const res = await login(credentials);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { role: string }).role).toBe("moderator");
  });

  it("never sends the email or password back", async () => {
    const login = await start();

    const text = await (await login(credentials)).text();

    expect(text).not.toContain(credentials.email);
    expect(text).not.toContain(credentials.password);
  });

  // Wrong email, wrong password and a locked account are the same answer, so none of them can be told apart.
  it("answers 401 when Payload does not accept the credentials", async () => {
    loginAccount.mockResolvedValue(undefined);
    const login = await start();

    const res = await login(credentials);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("answers 403 for an account that may not moderate, such as the service account", async () => {
    loginAccount.mockResolvedValue({ ...account, role: "service" });
    const login = await start();

    const res = await login(credentials);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_a_moderator" });
  });

  it("answers 403 for a moderator who has no display name yet", async () => {
    loginAccount.mockResolvedValue({ ...account, displayName: null });
    const login = await start();

    const res = await login(credentials);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no_display_name" });
  });

  it("answers 503, not 401, when Payload cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loginAccount.mockRejectedValue(new Error("payload down"));
    const login = await start();

    const res = await login(credentials);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("does not log the password when something fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    loginAccount.mockRejectedValue(new Error("payload down"));
    const login = await start();

    await login(credentials);

    expect(JSON.stringify(error.mock.calls)).not.toContain(
      credentials.password,
    );
  });

  it("is switched off, with its own answer, when no signing secret is set", async () => {
    const login = await start({ authTokenSecret: "" });

    const res = await login(credentials);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "moderator_login_disabled" });
    expect(loginAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", {}],
    ["no password", { email: "ada@example.com" }],
    ["no email", { password: "x" }],
    ["numbers", { email: 1, password: 2 }],
    ["an empty password", { email: "ada@example.com", password: "" }],
    [
      "a huge password",
      { email: "ada@example.com", password: "x".repeat(500) },
    ],
    [
      "a huge email",
      { email: `${"a".repeat(300)}@example.com`, password: "x" },
    ],
  ])("answers 400 to %s without asking Payload", async (_label, body) => {
    const login = await start();

    const res = await login(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(loginAccount).not.toHaveBeenCalled();
  });

  it("answers 400 to something that is not JSON", async () => {
    const login = await start();

    const res = await login("{not json", { raw: true });

    expect(res.status).toBe(400);
    expect(loginAccount).not.toHaveBeenCalled();
  });

  it("refuses a very large body", async () => {
    const login = await start();

    const res = await login({ ...credentials, padding: "x".repeat(10_000) });

    expect(res.status).toBe(413);
    expect(loginAccount).not.toHaveBeenCalled();
  });

  describe("rate limit", () => {
    const limit = { max: 3, windowMs: 60_000 };

    it("stops guessing after a few attempts, wrong ones included", async () => {
      loginAccount.mockResolvedValue(undefined);
      const login = await start({ loginRateLimit: limit });

      for (let i = 0; i < limit.max; i++) {
        expect((await login(credentials)).status).toBe(401);
      }

      const blocked = await login(credentials);

      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({ error: "rate_limited" });
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(loginAccount).toHaveBeenCalledTimes(limit.max);
    });

    it("counts clients separately behind a trusted proxy", async () => {
      loginAccount.mockResolvedValue(undefined);
      const login = await start({
        loginRateLimit: limit,
        trustedProxyHops: 1,
      });
      const from = (ip: string) => ({ headers: { "X-Forwarded-For": ip } });

      for (let i = 0; i < limit.max; i++) {
        await login(credentials, from("203.0.113.1"));
      }

      expect((await login(credentials, from("203.0.113.1"))).status).toBe(429);
      expect((await login(credentials, from("203.0.113.2"))).status).toBe(401);
    });

    it("is not dodged by a forged forwarding header when no proxy is trusted", async () => {
      loginAccount.mockResolvedValue(undefined);
      const login = await start({ loginRateLimit: limit, trustedProxyHops: 0 });

      for (let i = 0; i < limit.max; i++) {
        await login(credentials, {
          headers: { "X-Forwarded-For": `203.0.113.${i}` },
        });
      }

      const res = await login(credentials, {
        headers: { "X-Forwarded-For": "198.51.100.9" },
      });

      expect(res.status).toBe(429);
    });
  });

  it("allows the web client's origin to call it from a browser", async () => {
    const login = await start();

    const res = await login(credentials, {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
  });
});
