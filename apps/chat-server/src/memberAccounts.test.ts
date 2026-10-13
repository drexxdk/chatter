import type { AddressInfo } from "node:net";
import http from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The settings of this server, with the dev provider switched on; the address of the server is filled in once it listens.
const testEnv = vi.hoisted(() => ({
  PORT: 4000,
  PAYLOAD_URL: "http://localhost:3000",
  PAYLOAD_SERVICE_API_KEY: "service-key",
  BAN_HASH_SALT: "a-salt-of-16-chars",
  WEB_ORIGIN: "http://localhost:5173",
  TRUST_PROXY_HOPS: 0,
  ROOMS_RATE_LIMIT_PER_MINUTE: 60,
  DEFAULT_SLOW_MODE_SECONDS: 10,
  SYNC_INTERVAL_MS: 30_000,
  AUTH_TOKEN_SECRET: "a-secret-of-at-least-32-characters!!",
  PUBLIC_API_URL: "",
  DEV_OAUTH: true,
  GOOGLE_CLIENT_ID: undefined as string | undefined,
  GOOGLE_CLIENT_SECRET: undefined as string | undefined,
  FACEBOOK_APP_ID: undefined,
  FACEBOOK_APP_SECRET: undefined,
  DISCORD_CLIENT_ID: undefined,
  DISCORD_CLIENT_SECRET: undefined,
}));

// A Redis that only keeps strings, for the sign-in state.
const store = vi.hoisted(() => new Map<string, string>());
// The accounts and the nicknames taken, in memory.
const accounts = vi.hoisted(() => ({
  users: new Map<number, Record<string, unknown>>(),
  names: new Map<string, number>(),
  nextId: 1,
}));
const getModeratorNames = vi.hoisted(() => vi.fn());

vi.mock("./env.js", () => ({ env: testEnv }));
vi.mock("./redis.js", () => ({
  redis: {
    set: async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    },
    getdel: async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    },
  },
}));
vi.mock("./rooms.js", () => ({ getCachedPublicRooms: vi.fn() }));
vi.mock("./legal.js", () => ({ getCachedLegal: vi.fn() }));
vi.mock("./names.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./names.js")>()),
  getModeratorNames,
  rememberModerator: vi.fn(),
}));
vi.mock("./members.js", async () => {
  const { normalizeName } =
    await vi.importActual<typeof import("./names.js")>("./names.js");

  return {
    isMemberName: async (nickname: string, exceptUserId?: number) => {
      const owner = accounts.names.get(normalizeName(nickname));
      return owner !== undefined && owner !== exceptUserId;
    },
    claimMemberName: async (userId: number, nickname: string) => {
      const key = normalizeName(nickname);
      if (accounts.names.has(key) && accounts.names.get(key) !== userId) {
        return false;
      }
      accounts.names.set(key, userId);
      return true;
    },
    releaseMemberName: async (userId: number, nickname: string) => {
      const key = normalizeName(nickname);
      if (accounts.names.get(key) === userId) accounts.names.delete(key);
    },
  };
});
vi.mock("./payloadClient.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./payloadClient.js")>();
  const identityOf = (user: Record<string, unknown>) =>
    `${user.provider}:${user.providerUserId}`;

  return {
    ...original,
    findUserByIdentity: async (identity: string) =>
      [...accounts.users.values()].find(
        (user) => identityOf(user) === identity,
      ),
    fetchUser: async (id: number) => accounts.users.get(id),
    createUser: async (data: Record<string, unknown>) => {
      const taken = [...accounts.users.values()];

      if (taken.some((user) => user.nicknameKey === data.nicknameKey)) {
        throw new original.PayloadError("taken", 400, "nicknameKey");
      }

      if (taken.some((user) => identityOf(user) === identityOf(data))) {
        throw new original.PayloadError("taken", 400, "identity");
      }

      const user = { id: accounts.nextId++, ...data };
      accounts.users.set(user.id, user);
      return user;
    },
    updateUser: async (id: number, changes: Record<string, unknown>) => {
      const user = { ...accounts.users.get(id), ...changes };
      accounts.users.set(id, user as Record<string, unknown>);
      return user;
    },
    deleteUser: async (id: number) => {
      accounts.users.delete(id);
    },
  };
});

const { createApp } = await import("./app.js");
const { signToken } = await import("./tokens.js");
const { safeReturnPath } = await import("./accounts.js");

const servers: http.Server[] = [];
const onAccountRemoved = vi.fn();
let base = "";

async function start(options: Parameters<typeof createApp>[0] = {}) {
  const server = http.createServer(
    createApp({ authRateLimit: { max: 1000, windowMs: 60_000 }, ...options }),
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  servers.push(server);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  testEnv.PUBLIC_API_URL = base;
}

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { headers, redirect: "manual" });

const post = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });

const outcomeOf = (response: Response) =>
  new URLSearchParams(
    new URL(response.headers.get("location") ?? "").hash.slice(1),
  );

// Goes through the provider as `who`, and returns what the web client is sent back with (the part after `#`).
async function signInAs(who: string, returnPath = "/rooms/general") {
  const started = await get(
    `/auth/dev/start?return=${encodeURIComponent(returnPath)}`,
  );
  expect(started.status).toBe(302);

  const authorize = new URL(started.headers.get("location") ?? "");
  expect(authorize.pathname).toBe("/dev-oauth/authorize");

  const approved = await fetch(`${base}/dev-oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      user: who,
      state: authorize.searchParams.get("state") ?? "",
      code_challenge: authorize.searchParams.get("code_challenge") ?? "",
    }),
    redirect: "manual",
  });
  expect(approved.status).toBe(302);

  const callback = await fetch(approved.headers.get("location") ?? "", {
    redirect: "manual",
  });
  expect(callback.status).toBe(302);

  const target = new URL(callback.headers.get("location") ?? "");
  expect(target.origin + target.pathname).toBe(
    "http://localhost:5173/auth/callback",
  );

  return outcomeOf(callback);
}

beforeEach(() => {
  store.clear();
  accounts.users.clear();
  accounts.names.clear();
  accounts.nextId = 1;
  getModeratorNames.mockReset().mockResolvedValue(["Ada Mod"]);
  onAccountRemoved.mockReset();
  testEnv.DEV_OAUTH = true;
  testEnv.GOOGLE_CLIENT_ID = undefined;
  testEnv.GOOGLE_CLIENT_SECRET = undefined;
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

describe("the providers", () => {
  it("lists the ones that are switched on", async () => {
    await start();

    expect(await (await get("/auth/providers")).json()).toEqual({
      providers: ["dev"],
    });
  });

  it("lists none without the secret that signs the sessions", async () => {
    await start({ authTokenSecret: "" });

    expect(await (await get("/auth/providers")).json()).toEqual({
      providers: [],
    });
  });

  it("lists a provider that has both of its settings", async () => {
    testEnv.GOOGLE_CLIENT_ID = "id";
    testEnv.GOOGLE_CLIENT_SECRET = "secret";
    await start();

    expect(await (await get("/auth/providers")).json()).toEqual({
      providers: ["google", "dev"],
    });
  });

  it("sends the browser to the provider with the state and a PKCE challenge", async () => {
    testEnv.GOOGLE_CLIENT_ID = "the-id";
    testEnv.GOOGLE_CLIENT_SECRET = "secret";
    await start();

    const res = await get("/auth/google/start?return=/rooms/music");
    const url = new URL(res.headers.get("location") ?? "");

    expect(res.status).toBe(302);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "the-id",
      redirect_uri: `${base}/auth/google/callback`,
      scope: "openid email profile",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("state")).toHaveLength(32);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("does not know a provider that is not switched on", async () => {
    await start();

    const res = await get("/auth/facebook/start");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_provider" });
  });
});

describe("a return address", () => {
  it.each(["/", "/rooms/general", "/rooms/a-b?x=1"])("keeps %s", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    undefined,
    42,
    "",
    "rooms/general",
    "//evil.example.com",
    "https://evil.example.com",
    "/\\evil.example.com",
    "/a\nb",
    "/auth/dev/callback",
    `/${"a".repeat(300)}`,
  ])("is replaced by the lobby: %j", (path) => {
    expect(safeReturnPath(path)).toBe("/");
  });
});

describe("signing in for the first time", () => {
  it("hands the browser a ticket and where it was, and makes no account yet", async () => {
    await start();

    const outcome = await signInAs("alice", "/rooms/music");

    expect(outcome.get("provider")).toBe("dev");
    expect(outcome.get("name")).toBe("alice");
    expect(outcome.get("return")).toBe("/rooms/music");
    expect(outcome.get("ticket")).toBeTruthy();
    expect(outcome.get("token")).toBeNull();
    expect(accounts.users.size).toBe(0);
  });

  it("makes the account with the nickname, the avatar and the age, and signs it in", async () => {
    await start();
    const ticket = (await signInAs("alice")).get("ticket");

    const res = await post("/auth/register", {
      ticket,
      nickname: " Alice ",
      avatar: "female",
      age: 30,
    });
    const body = (await res.json()) as {
      token: string;
      profile: unknown;
      provider: string;
    };

    expect(res.status).toBe(200);
    expect(body.profile).toEqual({
      nickname: "Alice",
      avatar: "female",
      age: 30,
    });
    expect(body.provider).toBe("dev");
    expect([...accounts.users.values()]).toEqual([
      expect.objectContaining({
        provider: "dev",
        providerUserId: "dev-alice",
        email: "alice@dev.test",
        nickname: "Alice",
        nicknameKey: "alice",
        avatar: "female",
        age: 30,
      }),
    ]);
    // The nickname is theirs from now on.
    expect(accounts.names.get("alice")).toBe(1);

    const me = await get("/me", { Authorization: `Bearer ${body.token}` });
    expect(me.status).toBe(200);
  });

  it("takes the plain avatar and no age when they are left out", async () => {
    await start();
    const ticket = (await signInAs("bob")).get("ticket");

    const res = await post("/auth/register", { ticket, nickname: "Bob" });

    expect(((await res.json()) as { profile: unknown }).profile).toEqual({
      nickname: "Bob",
      avatar: "other",
    });
  });

  it("signs in the same person again with a token, without asking for a nickname", async () => {
    await start();
    await post("/auth/register", {
      ticket: (await signInAs("alice")).get("ticket"),
      nickname: "Alice",
    });

    const outcome = await signInAs("alice");

    expect(outcome.get("ticket")).toBeNull();
    expect(outcome.get("token")).toBeTruthy();
    expect(accounts.users.size).toBe(1);
  });

  it("does not make a second account when the same ticket is used twice", async () => {
    await start();
    const ticket = (await signInAs("alice")).get("ticket");

    const first = await post("/auth/register", { ticket, nickname: "Alice" });
    const second = await post("/auth/register", { ticket, nickname: "Alicia" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(accounts.users.size).toBe(1);
    expect(
      ((await second.json()) as { profile: { nickname: string } }).profile
        .nickname,
    ).toBe("Alice");
  });
});

describe("a sign-in that does not go through", () => {
  it("sends the browser back with an error for a state nobody knows", async () => {
    await start();

    const res = await get("/auth/dev/callback?code=x&state=nope");

    expect(res.status).toBe(302);
    expect(outcomeOf(res).get("error")).toBe("invalid_state");
  });

  it("works once: the same return is refused the second time", async () => {
    await start();
    const started = await get("/auth/dev/start");
    const state =
      new URL(started.headers.get("location") ?? "").searchParams.get(
        "state",
      ) ?? "";

    const first = await get(
      `/auth/dev/callback?error=access_denied&state=${state}`,
    );
    const second = await get(
      `/auth/dev/callback?error=access_denied&state=${state}`,
    );

    expect(outcomeOf(first).get("error")).toBe("denied");
    expect(outcomeOf(second).get("error")).toBe("invalid_state");
  });

  it("says it failed when the provider refuses the code", async () => {
    await start();
    const started = await get("/auth/dev/start");
    const state =
      new URL(started.headers.get("location") ?? "").searchParams.get(
        "state",
      ) ?? "";

    const res = await get(`/auth/dev/callback?code=made-up&state=${state}`);

    expect(outcomeOf(res).get("error")).toBe("failed");
  });
});

describe("making the account", () => {
  async function register(body: Record<string, unknown>, who = "alice") {
    const ticket = (await signInAs(who)).get("ticket");
    return post("/auth/register", { ticket, ...body });
  }

  it("refuses a ticket that was not signed here", async () => {
    await start();

    const res = await post("/auth/register", {
      ticket: "eyJ9.abc",
      nickname: "Alice",
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_ticket" });
  });

  it("refuses a session token in place of a ticket", async () => {
    await start();
    const token = signToken(
      { sub: 1, name: "Alice", role: "member" },
      { secret: testEnv.AUTH_TOKEN_SECRET, ttlMs: 60_000 },
    );

    const res = await post("/auth/register", { ticket: token, nickname: "Al" });

    expect(res.status).toBe(401);
  });

  it.each(["", "A", "a".repeat(40), "bad<name>", 42, null])(
    "refuses the nickname %j",
    async (nickname) => {
      await start();

      const res = await register({ nickname });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_nickname" });
      expect(accounts.users.size).toBe(0);
    },
  );

  it.each([17, 100, 20.5, "30", true])("refuses the age %j", async (age) => {
    await start();

    const res = await register({ nickname: "Alice", age });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_profile" });
  });

  it("refuses a name that is a moderator's, or that claims to be staff", async () => {
    await start();

    for (const nickname of ["Ada Mod", "ada_mod", "Support Team"]) {
      const res = await register({ nickname });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "reserved_nickname" });
    }
  });

  it("refuses a nickname that another account has, however it is written", async () => {
    await start();
    await register({ nickname: "Alice" });

    const res = await register({ nickname: "a.l.i.c.e" }, "carol");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "reserved_nickname" });
  });

  it("answers 409 too when the nickname was taken between the check and the account", async () => {
    await start();
    accounts.users.set(99, {
      id: 99,
      provider: "dev",
      providerUserId: "other",
      nickname: "Zed",
      nicknameKey: "zed",
    });

    const res = await register({ nickname: "Zed" });

    expect(res.status).toBe(409);
  });
});

describe("the account's own data", () => {
  async function signedIn() {
    const ticket = (await signInAs("alice")).get("ticket");
    const res = await post("/auth/register", {
      ticket,
      nickname: "Alice",
      avatar: "trans",
    });

    return ((await res.json()) as { token: string }).token;
  }

  it("is read with the session token, which comes back renewed", async () => {
    await start();
    const token = await signedIn();

    const res = await get("/me", { Authorization: `Bearer ${token}` });
    const body = (await res.json()) as {
      profile: unknown;
      provider: string;
      token: string;
      expiresAt: number;
    };

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.profile).toEqual({ nickname: "Alice", avatar: "trans" });
    expect(body.provider).toBe("dev");
    expect(body.token).toBeTruthy();
    expect(body.expiresAt).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it.each([
    ["no token", undefined],
    ["a token that is not one", "Bearer abc"],
    ["something else than a bearer token", "Basic abc"],
  ])("refuses %s", async (_name, header) => {
    await start();

    const res = await get("/me", header ? { Authorization: header } : {});

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_token" });
  });

  it("refuses a moderator's token", async () => {
    await start();
    const token = signToken(
      { sub: 1, name: "Ada Mod", role: "moderator" },
      { secret: testEnv.AUTH_TOKEN_SECRET, ttlMs: 60_000 },
    );

    expect(
      (await get("/me", { Authorization: `Bearer ${token}` })).status,
    ).toBe(401);
  });

  it("refuses a token whose account is gone", async () => {
    await start();
    const token = await signedIn();
    accounts.users.clear();

    expect(
      (await get("/me", { Authorization: `Bearer ${token}` })).status,
    ).toBe(401);
  });

  it("is deleted on request: the nickname is free again and what is connected as it is cut off", async () => {
    await start({ onAccountRemoved });
    const token = await signedIn();

    const res = await fetch(`${base}/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(accounts.users.size).toBe(0);
    expect(accounts.names.has("alice")).toBe(false);
    expect(onAccountRemoved).toHaveBeenCalledWith(1);
    expect(
      (await get("/me", { Authorization: `Bearer ${token}` })).status,
    ).toBe(401);
  });

  it("is limited, like the other routes of an account", async () => {
    await start({ authRateLimit: { max: 2, windowMs: 60_000 } });

    await get("/me");
    await get("/me");
    const refused = await get("/me");

    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "rate_limited" });
  });
  it("does not have the list of providers count against the account's own limit, but against the room list's", async () => {
    await start({
      authRateLimit: { max: 1, windowMs: 60_000 },
      roomsRateLimit: { max: 3, windowMs: 60_000 },
    });

    for (let i = 0; i < 3; i++) {
      expect((await get("/auth/providers")).status).toBe(200);
    }

    expect((await get("/auth/providers")).status).toBe(429);
  });
});

describe("the stand-in provider", () => {
  it("is not there unless it is switched on", async () => {
    testEnv.DEV_OAUTH = false;
    await start();

    expect((await get("/dev-oauth/authorize")).status).toBe(404);
    expect(await (await get("/auth/providers")).json()).toEqual({
      providers: [],
    });
  });

  it("shows a page with one box, and puts nothing the page was given into it unescaped", async () => {
    await start();

    const res = await get(
      `/dev-oauth/authorize?state=${encodeURIComponent('"><script>x</script>')}`,
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('name="user"');
    expect(html).not.toContain("<script>x");
  });
});
