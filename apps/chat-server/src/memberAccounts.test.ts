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
const beforeCreateUser = vi.hoisted(() => vi.fn<() => Promise<void>>());
const beforeUpdateUser = vi.hoisted(() => vi.fn<() => Promise<void>>());
const changeStaffPassword = vi.hoisted(() => vi.fn());
const staffLinks = vi.hoisted(
  () =>
    new Map<
      string,
      { id: number; staff: number; provider: string; identity: string }
    >(),
);
const verifyHuman = vi.hoisted(() => vi.fn());
const memberLinks = vi.hoisted(
  () =>
    new Map<
      string,
      { id: number; member: number; provider: string; identity: string }
    >(),
);
vi.mock("./turnstile.js", () => ({ verifyHuman }));

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

  const members = {
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
  return {
    ...members,
    cacheMemberNames: async (
      userId: number,
      nicknames: string[],
      previous: string[] = [],
    ) => {
      const names = new Set(nicknames.map(normalizeName));
      for (const nickname of nicknames)
        await members.claimMemberName(userId, nickname);
      for (const nickname of previous) {
        if (!names.has(normalizeName(nickname)))
          await members.releaseMemberName(userId, nickname);
      }
    },
  };
});
vi.mock("./payloadClient.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./payloadClient.js")>();
  const identityOf = (user: Record<string, unknown>) =>
    `${user.provider}:${user.providerUserId}`;

  return {
    ...original,
    changeStaffPassword,
    findStaffProvider: async (identity: string) => staffLinks.get(identity),
    fetchStaffAccount: async (id: number) => accounts.users.get(id),
    fetchStaffProviders: async (staff: number) =>
      [...staffLinks.values()]
        .filter((link) => link.staff === staff)
        .map((link) => link.provider),
    createStaffProvider: async (
      staff: number,
      provider: string,
      identity: string,
    ) => {
      staffLinks.set(identity, {
        id: staffLinks.size + 1,
        staff,
        provider,
        identity,
      });
    },
    deleteStaffProvider: async (staff: number, provider: string) => {
      for (const [identity, link] of staffLinks)
        if (link.staff === staff && link.provider === provider)
          staffLinks.delete(identity);
    },
    fetchMemberProviderLinks: async (member: number) =>
      [...memberLinks.values()].filter((link) => link.member === member),
    createMemberProvider: async (
      member: number,
      provider: string,
      identity: string,
    ) => {
      memberLinks.set(identity, {
        id: memberLinks.size + 1,
        member,
        provider,
        identity,
      });
    },
    deleteMemberProvider: async (id: number) => {
      for (const [identity, link] of memberLinks)
        if (link.id === id) memberLinks.delete(identity);
    },
    fetchNotificationOwner: async (_collection: string, id: number) =>
      accounts.users.get(id),
    saveSidebarPreference: async (
      _collection: string,
      id: number,
      sidebarOpen: boolean,
    ) => {
      await beforeUpdateUser();
      accounts.users.set(id, { ...accounts.users.get(id), sidebarOpen });
    },
    saveNotificationPreferences: async (
      _collection: string,
      id: number,
      preferences: unknown,
    ) => {
      await beforeUpdateUser();
      accounts.users.set(id, {
        ...accounts.users.get(id),
        notificationPreferences: preferences,
      });
    },
    findUserByIdentity: async (identity: string) =>
      [...accounts.users.values()].find(
        (user) => identityOf(user) === identity,
      ) ?? accounts.users.get(memberLinks.get(identity)?.member ?? -1),
    findPasswordUser: async (key: string) =>
      [...accounts.users.values()].find(
        (user) => Boolean(user.passwordHash) && user.nicknameKey === key,
      ),
    fetchUser: async (id: number) => {
      const user = accounts.users.get(id);
      return user
        ? { ...user, birthDate: user.birthDate ?? undefined }
        : undefined;
    },
    createUser: async (data: Record<string, unknown>) => {
      await beforeCreateUser();
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
      await beforeUpdateUser();
      if (
        changes.nicknameKey &&
        [...accounts.users.entries()].some(
          ([owner, user]) =>
            owner !== id && user.nicknameKey === changes.nicknameKey,
        )
      ) {
        throw new original.PayloadError("taken", 400, "nicknameKey");
      }
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
const { signToken, verifyToken } = await import("./tokens.js");
const { safeReturnPath } = await import("./accounts.js");
const { claimGuestAccount } = await import("./passwordAccounts.js");

const servers: http.Server[] = [];
const onAccountRemoved = vi.fn();
let base = "";
// What an account needs to be made besides the ticket: a username, the name the chat shows, and a picture.
const PICTURE = "lorelei:abc12345";
const details = (username = "alice", nickname = "Alice") => ({
  username,
  nickname,
  picture: PICTURE,
});

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

function pauseAccountCreation() {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeCreateUser.mockImplementationOnce(async () => {
    entered();
    await finished;
  });
  return { started, release };
}

function nextRequestRead() {
  return new Promise<void>((resolve) => {
    servers.at(-1)!.once("request", (request) => {
      request.once("end", () => setImmediate(resolve));
    });
  });
}

// Goes through the provider as `who`, and returns what the web client is sent back with (the part after `#`).
async function signInAs(
  who: string,
  returnPath = "/rooms/general",
  linkUrl?: string,
) {
  let targetUrl = linkUrl;
  if (!targetUrl) {
    const started = await get(
      `/auth/dev/start?return=${encodeURIComponent(returnPath)}`,
    );
    expect(started.status).toBe(302);
    targetUrl = started.headers.get("location") ?? "";
  }
  const authorize = new URL(targetUrl);
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
  verifyHuman.mockReset().mockResolvedValue(undefined);
  store.clear();
  staffLinks.clear();
  memberLinks.clear();
  accounts.users.clear();
  accounts.names.clear();
  accounts.nextId = 1;
  getModeratorNames.mockReset().mockResolvedValue(["Ada Mod"]);
  beforeCreateUser.mockReset().mockResolvedValue(undefined);
  beforeUpdateUser.mockReset().mockResolvedValue(undefined);
  changeStaffPassword.mockReset().mockResolvedValue(true);
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

describe("staff password changes", () => {
  const headers = {
    Authorization: `Bearer ${signToken({ sub: 7, name: "Ada Mod", role: "moderator" }, { secret: testEnv.AUTH_TOKEN_SECRET, ttlMs: 3600000 })}`,
  };
  const body = {
    currentPassword: "CurrentPassword42",
    password: "NewSecurePassword42",
    confirmation: "NewSecurePassword42",
  };
  beforeEach(async () => {
    await start();
    accounts.users.set(7, {
      id: 7,
      role: "moderator",
      displayName: "Ada Mod",
      email: "ada@example.test",
    });
  });

  it.each(["moderator", "super-admin"])(
    "verifies the current password of the authenticated %s",
    async (role) => {
      accounts.users.set(7, { ...accounts.users.get(7), role });
      const response = await post(
        "/me/password",
        { ...body, staffAccountId: 8, role: "super-admin" },
        headers,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(changeStaffPassword).toHaveBeenCalledWith(
        { id: 7, email: "ada@example.test" },
        body.currentPassword,
        body.password,
      );
      expect(
        (await fetch(`${base}/me`, { method: "DELETE", headers })).status,
      ).toBe(401);
      expect(accounts.users.has(7)).toBe(true);
    },
  );

  it("rejects an incorrect current password", async () => {
    changeStaffPassword.mockResolvedValue(false);
    const response = await post("/me/password", body, headers);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "invalid_current_password",
    });
  });

  it.each([
    { password: "weak", confirmation: "weak" },
    { confirmation: "different" },
  ])(
    "validates the shared password policy before contacting Payload: %o",
    async (changes) => {
      expect(
        (await post("/me/password", { ...body, ...changes }, headers)).status,
      ).toBe(400);
      expect(changeStaffPassword).not.toHaveBeenCalled();
    },
  );

  it("rejects removed and demoted staff accounts", async () => {
    accounts.users.set(7, { ...accounts.users.get(7), role: "service" });
    expect((await post("/me/password", body, headers)).status).toBe(401);
    accounts.users.delete(7);
    expect((await post("/me/password", body, headers)).status).toBe(401);
    expect(changeStaffPassword).not.toHaveBeenCalled();
  });
});

describe("staff provider linking", () => {
  const headers = (id = 7, role: "moderator" | "member" = "moderator") => ({
    Authorization: `Bearer ${signToken({ sub: id, name: "Staff", role }, { secret: testEnv.AUTH_TOKEN_SECRET, ttlMs: 60_000 })}`,
  });
  async function linkStart(id = 7) {
    const response = await post(
      "/me/providers/dev/start",
      { returnPath: "/?dialog=profile", staffAccountId: 99 },
      headers(id),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { url: string }).url;
  }
  beforeEach(async () => {
    await start();
    accounts.users.set(7, {
      id: 7,
      role: "super-admin",
      displayName: "Frederik Nielsen",
    });
  });

  it("links to the bearer owner and signs in later with the same staff role", async () => {
    const outcome = await signInAs("staff-provider", "/", await linkStart());
    expect(outcome.get("staff")).toBe("1");
    const staffSession = await get("/me/staff", {
      Authorization: `Bearer ${outcome.get("token")}`,
    });
    expect(await staffSession.json()).toMatchObject({
      name: "Frederik Nielsen",
      admin: true,
      provider: "dev",
    });
    expect(
      verifyToken(outcome.get("token"), { secret: testEnv.AUTH_TOKEN_SECRET }),
    ).toMatchObject({ sub: 7, role: "moderator", name: "Frederik Nielsen" });
    expect(await (await get("/me/providers", headers())).json()).toEqual({
      providers: ["dev"],
      canDisconnect: true,
    });
    const later = await signInAs("staff-provider");
    expect(later.get("staff")).toBe("1");
    expect(
      verifyToken(later.get("token"), { secret: testEnv.AUTH_TOKEN_SECRET })
        ?.sub,
    ).toBe(7);
    expect(accounts.users.size).toBe(1);
  });

  it("requires eligible staff authentication", async () => {
    expect((await post("/me/providers/dev/start", {})).status).toBe(401);
    expect(
      (await post("/me/providers/dev/start", {}, headers(7, "member"))).status,
    ).toBe(401);
    accounts.users.set(7, { id: 7, role: "service", displayName: "Service" });
    expect((await post("/me/providers/dev/start", {}, headers())).status).toBe(
      401,
    );
  });

  it("rejects a provider linked to a different staff account", async () => {
    await signInAs("owned-provider", "/", await linkStart());
    accounts.users.set(8, {
      id: 8,
      role: "moderator",
      displayName: "Other staff",
    });
    const result = await signInAs("owned-provider", "/", await linkStart(8));
    expect(result.get("error")).toBe("provider_in_use");
    expect([...staffLinks.values()][0]?.staff).toBe(7);
  });

  it("disconnects only the staff owner's provider and no longer signs in as staff", async () => {
    await signInAs("staff-provider", "/", await linkStart());
    const response = await fetch(`${base}/me/providers/dev`, {
      method: "DELETE",
      headers: headers(),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      providers: [],
      canDisconnect: true,
    });
    const later = await signInAs("staff-provider");
    expect(later.get("staff")).toBeNull();
    expect(later.has("ticket")).toBe(true);
    expect(accounts.users.get(7)?.role).toBe("super-admin");
  });

  it("rejects linking an existing member identity and staff removed during the flow", async () => {
    accounts.users.set(9, {
      id: 9,
      provider: "dev",
      providerUserId: "dev-member-provider",
    });
    const memberResult = await signInAs(
      "member-provider",
      "/",
      await linkStart(),
    );
    expect(memberResult.get("error")).toBe("provider_in_use");
    const url = await linkStart();
    accounts.users.delete(7);
    expect((await signInAs("new-provider", "/", url)).get("error")).toBe(
      "invalid_token",
    );
    expect(staffLinks.size).toBe(0);
  });
});

describe("member provider connections", () => {
  const headers = (id = 7) => ({
    Authorization: `Bearer ${signToken({ sub: id, name: "Alice", role: "member" }, { secret: testEnv.AUTH_TOKEN_SECRET, ttlMs: 60_000 })}`,
  });
  async function linkStart(id = 7) {
    const response = await post(
      "/me/providers/dev/start",
      { memberAccountId: 99, returnPath: "/?dialog=profile" },
      headers(id),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { url: string }).url;
  }
  const remove = (provider = "dev", id = 7) =>
    fetch(`${base}/me/providers/${provider}`, {
      method: "DELETE",
      headers: headers(id),
    });
  beforeEach(async () => {
    await start();
    testEnv.GOOGLE_CLIENT_ID = "configured-client";
    testEnv.GOOGLE_CLIENT_SECRET = "configured-secret";
    accounts.users.set(7, {
      id: 7,
      provider: "password",
      providerUserId: "alice",
      passwordHash: "hash",
      nickname: "Alice",
      nicknameKey: "alice",
      displayName: "Alice",
      avatar: "female",
    });
  });
  it("links a provider to the authenticated member without changing their profile or creating another account", async () => {
    const outcome = await signInAs("member-extra", "/", await linkStart());
    expect(
      verifyToken(outcome.get("token"), { secret: testEnv.AUTH_TOKEN_SECRET }),
    ).toMatchObject({ sub: 7, role: "member" });
    expect(outcome.has("staff")).toBe(false);
    expect(memberLinks.get("dev:dev-member-extra")?.member).toBe(7);
    expect(accounts.users.get(7)).toMatchObject({
      nickname: "Alice",
      avatar: "female",
      provider: "password",
    });
    expect(accounts.users.size).toBe(1);
    expect(
      verifyToken((await signInAs("member-extra")).get("token"), {
        secret: testEnv.AUTH_TOKEN_SECRET,
      })?.sub,
    ).toBe(7);
    expect(await (await get("/me/providers", headers())).json()).toEqual({
      providers: ["dev"],
      canDisconnect: true,
    });
    expect((await remove()).status).toBe(200);
    expect((await signInAs("member-extra")).has("ticket")).toBe(true);
  });
  it("rejects identities owned by other members or staff and does not silently switch accounts", async () => {
    memberLinks.set("dev:dev-owned", {
      id: 1,
      member: 8,
      provider: "dev",
      identity: "dev:dev-owned",
    });
    accounts.users.set(8, {
      id: 8,
      provider: "password",
      providerUserId: "bob",
    });
    expect((await signInAs("owned", "/", await linkStart())).get("error")).toBe(
      "provider_in_use",
    );
    staffLinks.set("dev:dev-staff", {
      id: 1,
      staff: 10,
      provider: "dev",
      identity: "dev:dev-staff",
    });
    expect((await signInAs("staff", "/", await linkStart())).get("error")).toBe(
      "provider_in_use",
    );
    expect(memberLinks.size).toBe(1);
  });
  it("requires authentication and rejects deleted members during the callback", async () => {
    expect(
      (await fetch(`${base}/me/providers/dev`, { method: "DELETE" })).status,
    ).toBe(401);
    const url = await linkStart();
    accounts.users.delete(7);
    expect((await signInAs("deleted", "/", url)).get("error")).toBe(
      "invalid_token",
    );
    expect(memberLinks.size).toBe(0);
  });
  it("does not disconnect another member's link or replace an already connected provider", async () => {
    await signInAs("first", "/", await linkStart());
    expect(
      (await signInAs("second", "/", await linkStart())).get("error"),
    ).toBe("provider_already_connected");
    accounts.users.set(8, {
      id: 8,
      provider: "password",
      providerUserId: "bob",
      passwordHash: "hash",
    });
    expect((await remove("dev", 8)).status).toBe(404);
    expect(memberLinks.get("dev:dev-first")?.member).toBe(7);
  });
  it("protects the last OAuth sign-in method and safely promotes another connection", async () => {
    accounts.users.set(7, {
      id: 7,
      provider: "dev",
      providerUserId: "dev-primary",
      nickname: "Alice",
      nicknameKey: "alice",
    });
    expect((await remove()).status).toBe(409);
    memberLinks.set("google:backup", {
      id: 1,
      member: 7,
      provider: "google",
      identity: "google:backup",
    });
    const response = await remove();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      providers: ["google"],
      canDisconnect: false,
    });
    expect(accounts.users.get(7)).toMatchObject({
      id: 7,
      provider: "google",
      providerUserId: "backup",
    });
    expect((await signInAs("primary")).has("ticket")).toBe(true);
    expect((await remove("google")).status).toBe(409);
  });
  it("serializes simultaneous removals so an OAuth-only account keeps a working sign-in", async () => {
    accounts.users.set(7, {
      id: 7,
      provider: "dev",
      providerUserId: "dev-primary",
      nickname: "Alice",
      nicknameKey: "alice",
    });
    memberLinks.set("google:backup", {
      id: 1,
      member: 7,
      provider: "google",
      identity: "google:backup",
    });
    const responses = await Promise.all([remove(), remove("google")]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      (await (await get("/me/providers", headers())).json()) as unknown,
    ).toMatchObject({ canDisconnect: false });
  });
  it("does not count a disabled backup provider as a usable sign-in method", async () => {
    testEnv.GOOGLE_CLIENT_ID = undefined;
    testEnv.GOOGLE_CLIENT_SECRET = undefined;
    accounts.users.set(7, {
      id: 7,
      provider: "dev",
      providerUserId: "dev-primary",
      nickname: "Alice",
      nicknameKey: "alice",
    });
    memberLinks.set("google:backup", {
      id: 1,
      member: 7,
      provider: "google",
      identity: "google:backup",
    });
    expect((await remove()).status).toBe(409);
    expect(accounts.users.get(7)?.provider).toBe("dev");
    expect((await remove("google")).status).toBe(200);
  });
});

describe("notification preferences", () => {
  const preferences = {
    enabled: false,
    volume: 0.25,
    sound: "bell",
    warnings: { enabled: true, sound: "pulse" },
    joins: { enabled: true, sound: "wood" },
  };
  const authorization = (role: "member" | "moderator" = "member") => ({
    Authorization: `Bearer ${signToken(
      { sub: 7, name: "Alice", role },
      { secret: testEnv.AUTH_TOKEN_SECRET, ttlMs: 60_000 },
    )}`,
  });
  const save = (
    body: unknown,
    headers: Record<string, string> = authorization(),
  ) =>
    fetch(`${base}/me/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    await start();
    accounts.users.set(7, { id: 7 });
  });

  it("rejects unauthenticated reads and writes", async () => {
    expect((await get("/me/notifications")).status).toBe(401);
    expect((await save(preferences, {})).status).toBe(401);
  });

  it.each(["member", "moderator"] as const)(
    "persists only the %s token owner's preferences",
    async (role) => {
      accounts.users.set(7, { id: 7, role });
      accounts.users.set(8, { id: 8 });
      const headers = authorization(role);
      expect(await (await get("/me/notifications", headers)).json()).toEqual({
        preferences: { enabled: false, volume: 0.5 },
      });
      const response = await save({ ...preferences, userId: 8 }, headers);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ preferences });
      const restored = await get("/me/notifications", headers);
      expect(restored.headers.get("cache-control")).toBe("no-store");
      expect(await restored.json()).toEqual({ preferences });
      expect(accounts.users.get(8)).toEqual({ id: 8 });
    },
  );

  it("rejects unknown sound names without writing anything", async () => {
    const response = await save({ ...preferences, sound: "unknown" });
    expect(response.status).toBe(400);
    expect(accounts.users.get(7)).toEqual({ id: 7 });
  });

  it("rejects deleted users and staff that no longer have access", async () => {
    accounts.users.delete(7);
    expect((await get("/me/notifications", authorization())).status).toBe(401);
    accounts.users.set(7, { id: 7, role: "service" });
    expect((await save(preferences, authorization("moderator"))).status).toBe(
      401,
    );
  });

  it("reports failed database saves rather than claiming success", async () => {
    beforeUpdateUser.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await save(preferences);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(accounts.users.get(7)).toEqual({ id: 7 });
  });
});

describe("sidebar preference", () => {
  const authorization = (role: "member" | "moderator" = "member") => ({
    Authorization: `Bearer ${signToken(
      { sub: 7, name: "Alice", role },
      { secret: testEnv.AUTH_TOKEN_SECRET, ttlMs: 60_000 },
    )}`,
  });
  const save = (body: unknown, headers = authorization()) =>
    fetch(`${base}/me/sidebar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    await start();
    accounts.users.set(7, { id: 7 });
  });

  it.each(["member", "moderator"] as const)(
    "saves and restores only the %s token owner's sidebar preference",
    async (role) => {
      accounts.users.set(7, { id: 7, role });
      accounts.users.set(8, { id: 8 });
      const headers = authorization(role);
      expect(await (await get("/me/sidebar", headers)).json()).toEqual({
        sidebarOpen: true,
      });
      for (const sidebarOpen of [false, true]) {
        expect((await save({ sidebarOpen, userId: 8 }, headers)).status).toBe(
          200,
        );
        const restored = await get("/me/sidebar", headers);
        expect(restored.headers.get("cache-control")).toBe("no-store");
        expect(await restored.json()).toEqual({ sidebarOpen });
      }
      expect(accounts.users.get(8)).toEqual({ id: 8 });
    },
  );

  it("rejects unauthorized, deleted and ineligible accounts", async () => {
    expect((await get("/me/sidebar")).status).toBe(401);
    expect(
      (await fetch(`${base}/me/sidebar`, { method: "PATCH" })).status,
    ).toBe(401);
    accounts.users.delete(7);
    expect((await get("/me/sidebar", authorization())).status).toBe(401);
    accounts.users.set(7, { id: 7, role: "service" });
    expect(
      (await save({ sidebarOpen: false }, authorization("moderator"))).status,
    ).toBe(401);
  });

  it.each([{}, { sidebarOpen: "false" }, { sidebarOpen: null }])(
    "rejects invalid values (%j)",
    async (body) => {
      expect((await save(body)).status).toBe(400);
      expect(accounts.users.get(7)).toEqual({ id: 7 });
    },
  );

  it("reports database write failures", async () => {
    beforeUpdateUser.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await save({ sidebarOpen: false })).status).toBe(503);
    expect(accounts.users.get(7)).toEqual({ id: 7 });
  });
});

describe("password accounts", () => {
  it.each([
    ["human_check_required", 400],
    ["human_check_failed", 400],
    ["unavailable", 503],
  ])(
    "requires human verification before password sign-in: %s",
    async (error, status) => {
      await start();
      verifyHuman.mockResolvedValue(error);
      const response = await post("/auth/password/login", {
        username: "alice",
        password: "PrivatePassword123",
        humanToken: "token",
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
      expect(verifyHuman).toHaveBeenCalledWith(
        "token",
        "password_login",
        expect.any(String),
      );
    },
  );

  it("does not require a challenge to start provider sign-in", async () => {
    await start();
    verifyHuman.mockResolvedValue("human_check_required");
    expect((await get("/auth/dev/start")).status).toBe(302);
    expect(verifyHuman).not.toHaveBeenCalled();
  });

  const password = "A long private password 1";
  const profile = {
    nickname: "Alice Guest",
    avatar: "other" as const,
    age: 24,
  };
  const claim = (changes = {}) =>
    claimGuestAccount(
      { username: "alice", password, confirmation: password, ...changes },
      profile,
      testEnv.AUTH_TOKEN_SECRET,
    );

  const change = (token: string, changes = {}) =>
    post(
      "/me/password",
      {
        currentPassword: password,
        password: "Another secure password 2",
        confirmation: "Another secure password 2",
        ...changes,
      },
      { Authorization: `Bearer ${token}` },
    );

  it("changes a password only after verifying the current one", async () => {
    const session = await claim();
    await start();
    const response = await change(session.token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(
      (await post("/auth/password/login", { username: "alice", password }))
        .status,
    ).toBe(401);
    expect(
      (
        await post("/auth/password/login", {
          username: "alice",
          password: "Another secure password 2",
        })
      ).status,
    ).toBe(200);
  });

  it("still signs in existing passwords that predate the stronger policy", async () => {
    await claim();
    const { hashPassword } = await import("./passwords.js");
    accounts.users.set(1, {
      ...accounts.users.get(1),
      passwordHash: await hashPassword("old lowercase password"),
    });
    await start();
    expect(
      (
        await post("/auth/password/login", {
          username: "alice",
          password: "old lowercase password",
        })
      ).status,
    ).toBe(200);
  });

  it.each([
    [{ currentPassword: "incorrect" }, 403, "invalid_current_password"],
    [
      { password: "weakpassword", confirmation: "weakpassword" },
      400,
      "invalid_password",
    ],
    [{ confirmation: "does not match" }, 400, "password_mismatch"],
  ])(
    "rejects an invalid password change without writing credentials",
    async (changes, status, error) => {
      const session = await claim();
      const original = accounts.users.get(1)?.passwordHash;
      await start();
      const response = await change(session.token, changes);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
      expect(accounts.users.get(1)?.passwordHash).toBe(original);
    },
  );

  it("lets provider accounts set a local password without replacing their provider or identity", async () => {
    const session = await claim();
    await start();
    expect((await post("/me/password", {})).status).toBe(401);
    accounts.users.set(1, {
      ...accounts.users.get(1),
      provider: "google",
      passwordHash: undefined,
    });
    const original = { ...accounts.users.get(1) };
    const response = await post(
      "/me/password",
      { password: "NewSecurePassword42", confirmation: "NewSecurePassword42" },
      { Authorization: `Bearer ${session.token}` },
    );
    expect(response.status).toBe(200);
    expect(accounts.users.get(1)).toMatchObject({
      provider: "google",
      providerUserId: original.providerUserId,
      nickname: original.nickname,
    });
    const login = await post("/auth/password/login", {
      username: "alice",
      password: "NewSecurePassword42",
    });
    expect(login.status).toBe(200);
    const localSession = (await login.json()) as { token: string };
    expect(localSession).toMatchObject({
      provider: "password",
      hasPassword: true,
    });
    const restored = await get("/me", {
      Authorization: `Bearer ${localSession.token}`,
    });
    expect(await restored.json()).toMatchObject({
      provider: "password",
      hasPassword: true,
    });
    expect(accounts.users.size).toBe(1);
    expect((await change(session.token)).status).toBe(403);
    expect(
      (
        await post(
          "/me/password",
          { password: "OtherPassword42", confirmation: "OtherPassword42" },
          { Authorization: `Bearer ${session.token}` },
        )
      ).status,
    ).toBe(403);
  });

  it("serializes concurrent changes so the old password cannot be reused", async () => {
    const session = await claim();
    await start();
    const responses = await Promise.all([
      change(session.token),
      change(session.token),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 403,
    ]);
  });

  it("rate limits current-password guesses", async () => {
    const session = await claim();
    await start({ authRateLimit: { max: 1, windowMs: 60_000 } });
    expect(
      (await change(session.token, { currentPassword: "incorrect" })).status,
    ).toBe(403);
    expect((await change(session.token)).status).toBe(429);
  });

  it("claims the server's guest profile and returns no credential hash", async () => {
    const session = await claim();
    expect(session).toMatchObject({
      provider: "password",
      profile: {
        nickname: "Alice Guest",
        username: "alice",
        avatar: "other",
        age: 24,
      },
    });
    expect(session.profile).not.toHaveProperty("picture");
    expect(session).not.toHaveProperty("passwordHash");
    const user = accounts.users.get(1)!;
    expect(user.passwordHash).toMatch(/^scrypt-v1:/);
    expect(JSON.stringify(user)).not.toContain(password);
    expect(accounts.names.has("aliceguest")).toBe(false);
    expect(accounts.names.get("alice")).toBe(1);
  });

  it.each([
    [{ confirmation: "different" }, "password_mismatch"],
    [{ password: "short", confirmation: "short" }, "invalid_password"],
    [{ username: "bad name" }, "invalid_username"],
  ])(
    "rejects invalid claim credentials before creating an account",
    async (changes, code) => {
      await expect(claim(changes)).rejects.toThrow(code);
      expect(accounts.users.size).toBe(0);
    },
  );

  it("allows claiming a profile with a display name matching another account", async () => {
    accounts.names.set("aliceguest", 99);
    await expect(claim()).resolves.toMatchObject({
      profile: { nickname: "Alice Guest" },
    });
    expect(accounts.users.size).toBe(1);
  });

  it("allows only one concurrent claim of the same profile", async () => {
    const results = await Promise.allSettled([claim(), claim()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(accounts.users.size).toBe(1);
  });

  it("signs in by normalized username, preserving profile and hiding the hash", async () => {
    await claim();
    await start();
    const response = await post("/auth/password/login", {
      username: "ALICE",
      password,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const session = await response.json();
    expect(session).toMatchObject({
      provider: "password",
      profile: { nickname: "Alice Guest", username: "alice" },
    });
    expect(JSON.stringify(session)).not.toContain("scrypt");
    expect(accounts.users.get(1)?.lastLoginAt).toBeTypeOf("string");
  });

  it("gives the same response for an unknown username and a wrong password", async () => {
    await claim();
    await start();
    for (const username of ["alice", "unknown"]) {
      const response = await post("/auth/password/login", {
        username,
        password: "wrong password",
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid_credentials" });
    }
  });

  it("uses the current username after an admin corrects it", async () => {
    await claim();
    const user = accounts.users.get(1)!;
    accounts.users.set(1, {
      ...user,
      nickname: "alicia",
      nicknameKey: "alicia",
    });
    await start();
    expect(
      (await post("/auth/password/login", { username: "alice", password }))
        .status,
    ).toBe(401);
    const response = await post("/auth/password/login", {
      username: "alicia",
      password,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: { username: "alicia" },
    });
  });

  it("signs in with a self-edited username and rejects the old username", async () => {
    const session = await claim();
    await start();
    const saved = await fetch(`${base}/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ username: "alice_new" }),
    });
    expect(saved.status).toBe(200);
    expect(
      (await post("/auth/password/login", { username: "alice", password }))
        .status,
    ).toBe(401);
    const signedIn = await post("/auth/password/login", {
      username: "ALICE_NEW",
      password,
    });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({
      profile: { username: "alice_new", nickname: "Alice Guest" },
    });
    expect(
      (await get("/me", { Authorization: `Bearer ${session.token}` })).status,
    ).toBe(200);
  });

  it("rate limits password attempts", async () => {
    await start({ authRateLimit: { max: 1, windowMs: 60_000 } });
    await post("/auth/password/login", { username: "unknown", password });
    const response = await post("/auth/password/login", {
      username: "unknown",
      password,
    });
    expect(response.status).toBe(429);
  });
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

  it("makes the account with the username, the display name, the picture, the avatar and the age, and signs it in", async () => {
    await start();
    const ticket = (await signInAs("alice")).get("ticket");

    const res = await post("/auth/register", {
      ticket,
      username: " alice_w ",
      nickname: "  Alice    Wonder ",
      picture: PICTURE,
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
      nickname: "Alice Wonder",
      username: "alice_w",
      picture: PICTURE,
      avatar: "female",
      age: 30,
    });
    expect(body.provider).toBe("dev");
    expect([...accounts.users.values()]).toEqual([
      expect.objectContaining({
        provider: "dev",
        providerUserId: "dev-alice",
        email: "alice@dev.test",
        nickname: "alice_w",
        nicknameKey: "alicew",
        displayName: "Alice Wonder",
        displayNameKey: "alicewonder",
        picture: PICTURE,
        avatar: "female",
        age: 30,
      }),
    ]);
    expect(accounts.names.get("alicew")).toBe(1);
    expect(accounts.names.has("alicewonder")).toBe(false);

    const me = await get("/me", { Authorization: `Bearer ${body.token}` });
    expect(me.status).toBe(200);
  });

  it("takes the plain avatar and no age when they are left out", async () => {
    await start();
    const ticket = (await signInAs("bob")).get("ticket");

    const res = await post("/auth/register", {
      ticket,
      ...details("bob", "Bob"),
    });

    expect(((await res.json()) as { profile: unknown }).profile).toEqual({
      nickname: "Bob",
      username: "bob",
      picture: PICTURE,
      avatar: "other",
    });
  });

  it("signs in the same person again with a token, without asking for a name", async () => {
    await start();
    await post("/auth/register", {
      ticket: (await signInAs("alice")).get("ticket"),
      ...details(),
    });

    const outcome = await signInAs("alice");

    expect(outcome.get("ticket")).toBeNull();
    expect(outcome.get("token")).toBeTruthy();
    expect(accounts.users.size).toBe(1);
  });

  it("does not make a second account when the same ticket is used twice", async () => {
    await start();
    const ticket = (await signInAs("alice")).get("ticket");

    const first = await post("/auth/register", { ticket, ...details() });
    const second = await post("/auth/register", {
      ticket,
      ...details("alicia", "Alicia"),
    });

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
    // Left out is how a test says it wants the field gone.
    const made = {
      ...details(who, who[0]!.toUpperCase() + who.slice(1)),
      ...body,
    };
    return post("/auth/register", { ticket, ...made });
  }

  it("refuses a ticket that was not signed here", async () => {
    await start();

    const res = await post("/auth/register", {
      ticket: "eyJ9.abc",
      ...details(),
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

    const res = await post("/auth/register", {
      ticket: token,
      ...details("al", "Al"),
    });

    expect(res.status).toBe(401);
  });

  it.each(["", "A", "a".repeat(40), "bad<name>", 42, null])(
    "refuses the display name %j",
    async (nickname) => {
      await start();

      const res = await register({ nickname });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_nickname" });
      expect(accounts.users.size).toBe(0);
    },
  );

  it.each(["", "A", "a".repeat(40), "has space", "bad<name>", 42, null])(
    "refuses the username %j",
    async (username) => {
      await start();

      const res = await register({ username });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_username" });
      expect(accounts.users.size).toBe(0);
    },
  );

  it.each([
    ["none", undefined],
    ["a style that is not offered", "robot:abc12345"],
    ["a seed that is not one", "lorelei:../etc"],
    ["something else", 42],
  ])("refuses %s as the picture", async (_name, picture) => {
    await start();

    const res = await register({ picture });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_profile" });
    expect(accounts.users.size).toBe(0);
  });

  it.each([17, 100, 20.5, "30", true])("refuses the age %j", async (age) => {
    await start();

    const res = await register({ age });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_profile" });
  });

  it("refuses a display name that is a moderator's, or that claims to be staff", async () => {
    await start();

    for (const nickname of ["Ada Mod", "ada_mod", "Support Team"]) {
      const res = await register({ nickname });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "reserved_nickname" });
    }
  });

  it("refuses a username that is a moderator's, or that claims to be staff", async () => {
    await start();

    for (const username of ["Ada_Mod", "ada.mod", "Support_Team"]) {
      const res = await register({ username });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "reserved_username" });
    }
  });

  it("allows different accounts to share a display name without sharing a private username", async () => {
    await start();
    const first = await register({
      username: "first_login",
      nickname: "Simon",
    });
    const second = await register(
      { username: "second_login", nickname: "Simon" },
      "bob",
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      profile: { nickname: "Simon" },
    });
  });

  it("keeps usernames unique without reserving their spelling as a display name", async () => {
    await start();
    await register({});

    const asUsername = await register({ username: "a.l.i.c.e" }, "carol");
    const asDisplayName = await register({ nickname: "A L I C E" }, "dave");

    expect(asUsername.status).toBe(409);
    expect(await asUsername.json()).toEqual({ error: "reserved_username" });
    expect(asDisplayName.status).toBe(200);
    expect(await asDisplayName.json()).toMatchObject({
      profile: { nickname: "A L I C E" },
    });
  });

  it("answers 409 too when a name was taken between the check and the account", async () => {
    await start();
    accounts.users.set(99, {
      id: 99,
      provider: "dev",
      providerUserId: "other",
      nickname: "Zed",
      nicknameKey: "zed",
      displayNameKey: "zedd",
    });

    const asUsername = await register({ username: "Zed" });
    const asDisplayName = await register({ nickname: "Zedd" }, "erin");

    expect(asUsername.status).toBe(409);
    expect(await asUsername.json()).toEqual({ error: "reserved_username" });
    expect(asDisplayName.status).toBe(200);
    expect(await asDisplayName.json()).toMatchObject({
      profile: { nickname: "Zedd" },
    });
  });

  it("allows overlapping registrations with swapped usernames and display names", async () => {
    await start();
    const firstTicket = (await signInAs("alice")).get("ticket");
    const secondTicket = (await signInAs("bob")).get("ticket");
    const paused = pauseAccountCreation();
    const first = post("/auth/register", {
      ticket: firstTicket,
      ...details("alpha", "Beta"),
    });
    await paused.started;

    const read = nextRequestRead();
    const second = post("/auth/register", {
      ticket: secondTicket,
      ...details("beta", "Alpha"),
    });
    try {
      await read;
    } finally {
      paused.release();
    }

    const [created, refused] = await Promise.all([first, second]);
    expect(created.status).toBe(200);
    expect(refused.status).toBe(200);
    expect(accounts.users.size).toBe(2);
    expect(accounts.names.get("alpha")).toBe(1);
    expect(accounts.names.get("beta")).toBe(2);
  });
});

describe("the account's own data", () => {
  async function signedIn() {
    const ticket = (await signInAs("alice")).get("ticket");
    const res = await post("/auth/register", {
      ticket,
      ...details(),
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
    expect(body.profile).toEqual({
      nickname: "Alice",
      username: "alice",
      picture: PICTURE,
      avatar: "trans",
    });
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

  describe("changed on request", () => {
    const patch = (token: string | undefined, body: unknown) =>
      fetch(`${base}/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

    it("stores a private birth date, derives the age and clears both on request", async () => {
      await start();
      const token = await signedIn();
      const birthDate = `${new Date().getUTCFullYear() - 35}-01-01`;
      const saved = await patch(token, { birthDate, age: 99 });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({
        profile: { birthDate, age: 35 },
      });
      expect(accounts.users.get(1)).toMatchObject({ birthDate, age: 35 });
      const cleared = await patch(token, { birthDate: null });
      expect(cleared.status).toBe(200);
      const body = await cleared.json();
      expect(body).not.toHaveProperty("profile.birthDate");
      expect(body).not.toHaveProperty("profile.age");
      expect(accounts.users.get(1)).toMatchObject({
        birthDate: null,
        age: null,
      });
    });

    it("preserves both fields when HTTP profile updates overlap", async () => {
      await start();
      const token = await signedIn();
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const finished = new Promise<void>((resolve) => {
        release = resolve;
      });
      beforeUpdateUser.mockImplementationOnce(async () => {
        entered();
        await finished;
      });

      const first = patch(token, { avatar: "male" });
      await started;
      const received = nextRequestRead();
      const second = patch(token, { age: 41 });
      try {
        await received;
      } finally {
        release();
      }

      const [firstReply, secondReply] = await Promise.all([first, second]);
      expect(firstReply.status).toBe(200);
      expect(secondReply.status).toBe(200);
      expect(await secondReply.json()).toMatchObject({
        profile: { avatar: "male", age: 41 },
      });
      expect(accounts.users.get(1)).toMatchObject({ avatar: "male", age: 41 });
    });

    it("changes private usernames repeatedly without a display-name cooldown", async () => {
      await start();
      const token = await signedIn();
      for (const username of ["alice_new", "alice_again", "alice"]) {
        const response = await patch(token, { username });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          profile: { username, nickname: "Alice" },
        });
        expect(accounts.users.get(1)).toMatchObject({
          nickname: username,
          nicknameKey: username.replace(/_/g, ""),
        });
      }
      expect(accounts.users.get(1)?.displayNameChangedAt).toBeUndefined();
      expect(accounts.names.has("alicenew")).toBe(false);
      expect(accounts.names.has("aliceagain")).toBe(false);
      expect(accounts.names.has("alice")).toBe(true);
    });

    it("allows username-only changes during the public display-name cooldown", async () => {
      await start();
      const token = await signedIn();
      expect((await patch(token, { nickname: "Alicia" })).status).toBe(200);
      const changedAt = accounts.users.get(1)?.displayNameChangedAt;
      expect((await patch(token, { username: "alice_new" })).status).toBe(200);
      expect(accounts.users.get(1)).toMatchObject({
        nickname: "alice_new",
        displayName: "Alicia",
        displayNameChangedAt: changedAt,
      });
      expect(
        (
          await patch(token, {
            username: "alice_again",
            nickname: "Alice Again",
          })
        ).status,
      ).toBe(429);
      expect(accounts.users.get(1)?.nickname).toBe("alice_new");
    });

    it.each(["a", "alice smith", "a".repeat(25), null, 123])(
      "rejects invalid username %j without changing the profile",
      async (username) => {
        await start();
        const token = await signedIn();
        const before = accounts.users.get(1);
        const response = await patch(token, { username, avatar: "male" });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid_username" });
        expect(accounts.users.get(1)).toEqual(before);
        expect(accounts.names.get("alice")).toBe(1);
      },
    );

    it("refuses an occupied normalized username or a protected staff username atomically", async () => {
      await start();
      const token = await signedIn();
      const ticket = (await signInAs("bob")).get("ticket");
      expect(
        (await post("/auth/register", { ticket, ...details("bob", "Bobby") }))
          .status,
      ).toBe(200);
      const before = accounts.users.get(1);
      for (const username of ["B_o.b", "admin"]) {
        const response = await patch(token, { username, avatar: "male" });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "reserved_username" });
        expect(accounts.users.get(1)).toEqual(before);
      }
      expect(accounts.names.get("alice")).toBe(1);
      expect(accounts.names.get("bob")).toBe(2);
    });

    it("maps a database uniqueness conflict without releasing the current username", async () => {
      await start();
      const token = await signedIn();
      accounts.users.set(2, { id: 2, nickname: "bob", nicknameKey: "bob" });
      const before = accounts.users.get(1);
      const response = await patch(token, { username: "bob", avatar: "male" });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "reserved_username" });
      expect(accounts.users.get(1)).toEqual(before);
      expect(accounts.names.get("alice")).toBe(1);
    });

    it("grants a concurrently requested username to just one account", async () => {
      await start();
      const alice = await signedIn();
      const ticket = (await signInAs("bob")).get("ticket");
      const registered = await post("/auth/register", {
        ticket,
        ...details("bob", "Bobby"),
      });
      const bob = ((await registered.json()) as { token: string }).token;
      const responses = await Promise.all([
        patch(alice, { username: "shared_name" }),
        patch(bob, { username: "SHARED.NAME" }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(
        [...accounts.users.values()].filter(
          (user) => user.nicknameKey === "sharedname",
        ),
      ).toHaveLength(1);
      const owner = accounts.names.get("sharedname");
      expect(owner).toBeDefined();
      expect(accounts.names.has(owner === 1 ? "alice" : "bob")).toBe(false);
      expect(accounts.names.get(owner === 1 ? "bob" : "alice")).toBe(
        owner === 1 ? 2 : 1,
      );
    });

    it("changes what is in the body and keeps the rest", async () => {
      await start();
      const token = await signedIn();

      const res = await patch(token, {
        nickname: "Alicia",
        avatar: "female",
        age: 30,
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        profile: {
          nickname: "Alicia",
          username: "alice",
          picture: PICTURE,
          avatar: "female",
          age: 30,
        },
      });
      expect(accounts.users.get(1)).toMatchObject({
        displayName: "Alicia",
        displayNameKey: "alicia",
        avatar: "female",
        age: 30,
      });
      expect(accounts.names.has("alicia")).toBe(false);
      expect(accounts.names.has("alice")).toBe(true);

      const again = await patch(token, {
        picture: "pixel-art:xyz98765",
        age: null,
      });

      expect(await again.json()).toEqual({
        profile: {
          nickname: "Alicia",
          username: "alice",
          picture: "pixel-art:xyz98765",
          avatar: "female",
        },
      });
    });

    it("lets the account keep or re-case its own name", async () => {
      await start();
      const token = await signedIn();

      expect((await patch(token, { nickname: "ALICE" })).status).toBe(200);
      expect(accounts.users.get(1)).toMatchObject({ displayName: "ALICE" });
    });

    it("allows sharing a moderator's display name", async () => {
      await start();
      const token = await signedIn();

      const res = await patch(token, { nickname: "Ada Mod" });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        profile: { nickname: "Ada Mod", username: "alice" },
      });
      expect(accounts.users.get(1)).toMatchObject({ displayName: "Ada Mod" });
      expect(accounts.names.has("adamod")).toBe(false);
      expect(accounts.names.has("alice")).toBe(true);
    });

    it.each([
      ["a name that is not valid", { nickname: "a" }, 400, "invalid_nickname"],
      ["an authority name", { nickname: "system" }, 409, "reserved_nickname"],
      [
        "an avatar that is not one",
        { avatar: "robot" },
        400,
        "invalid_profile",
      ],
      [
        "a picture that is not one",
        { picture: "robot:abc" },
        400,
        "invalid_profile",
      ],
      ["an age that is not one", { age: 3 }, 400, "invalid_profile"],
    ])("refuses %s", async (_name, body, status, error) => {
      await start();
      const token = await signedIn();

      const res = await patch(token, body);

      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error });
      expect(accounts.users.get(1)).toMatchObject({ displayName: "Alice" });
    });

    it("enforces a 24-hour display-name cooldown without blocking other profile edits", async () => {
      await start();
      const token = await signedIn();
      expect((await patch(token, { nickname: "First Name" })).status).toBe(200);
      const refused = await patch(token, { nickname: "Second Name" });
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({
        error: "display_name_cooldown",
        retryAfterSeconds: expect.any(Number),
      });
      expect(
        (await patch(token, { nickname: "First Name", avatar: "female" }))
          .status,
      ).toBe(200);
      expect(accounts.users.get(1)).toMatchObject({
        displayName: "First Name",
        avatar: "female",
      });
    });

    it("allows a rename at the exact 24-hour boundary and starts a new cooldown", async () => {
      await start();
      const token = await signedIn();
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      try {
        const account = accounts.users.get(1)!;
        account.displayNameChangedAt = new Date(
          now - 86_400_000 + 1,
        ).toISOString();
        const refused = await patch(token, { nickname: "New Name" });
        expect(refused.status).toBe(429);
        expect(refused.headers.get("Retry-After")).toBe("1");
        expect(await refused.json()).toEqual({
          error: "display_name_cooldown",
          retryAfterSeconds: 1,
        });
        clock.mockReturnValue(now + 1);
        expect((await patch(token, { nickname: "New Name" })).status).toBe(200);
        const changedAt = accounts.users.get(1)!.displayNameChangedAt;
        expect(changedAt).toBe(new Date(now + 1).toISOString());
        expect(
          (await patch(token, { nickname: "New Name", avatar: "male" })).status,
        ).toBe(200);
        expect(accounts.users.get(1)!.displayNameChangedAt).toBe(changedAt);
      } finally {
        clock.mockRestore();
      }
    });

    it("allows only one concurrent display-name change per cooldown", async () => {
      await start();
      const token = await signedIn();
      const results = await Promise.all([
        patch(token, { nickname: "First Name" }),
        patch(token, { nickname: "Second Name" }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 429]);
    });

    it("allows a display name another account has", async () => {
      await start();
      const token = await signedIn();
      const ticket = (await signInAs("bob")).get("ticket");
      await post("/auth/register", { ticket, ...details("bob", "Bobby") });

      const res = await patch(token, { nickname: "bobby" });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        profile: { nickname: "bobby" },
      });
    });

    it("allows a display-name rename during an overlapping username registration", async () => {
      await start();
      const token = await signedIn();
      const ticket = (await signInAs("bob")).get("ticket");
      const paused = pauseAccountCreation();
      const registration = post("/auth/register", {
        ticket,
        ...details("shared", "Bobby"),
      });
      await paused.started;

      const read = nextRequestRead();
      const rename = patch(token, { nickname: "Shared" });
      try {
        await read;
      } finally {
        paused.release();
      }

      const [created, refused] = await Promise.all([registration, rename]);
      expect(created.status).toBe(200);
      expect(refused.status).toBe(200);
      expect(accounts.users.get(1)).toMatchObject({ displayName: "Shared" });
      expect(accounts.names.get("shared")).toBe(2);
    });

    it("refuses without a session", async () => {
      await start();

      expect((await patch(undefined, { age: 30 })).status).toBe(401);
    });
  });

  it("limits account reads using the read-only budget", async () => {
    await start({ roomsRateLimit: { max: 2, windowMs: 60_000 } });

    await get("/me");
    await get("/me");
    const refused = await get("/me");

    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "rate_limited" });
  });

  it("does not count account reads against account writes", async () => {
    await start({ authRateLimit: { max: 1, windowMs: 60_000 } });

    for (const path of [
      "/me",
      "/me/staff",
      "/me/providers",
      "/me/notifications",
      "/me/sidebar",
    ]) {
      expect((await get(path)).status).toBe(401);
    }

    const write = () => fetch(`${base}/me`, { method: "PATCH" });
    expect((await write()).status).toBe(401);
    expect((await write()).status).toBe(429);
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
