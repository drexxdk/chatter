import { describe, expect, it } from "vitest";

import { parseEnv } from "./envSchema.js";

const REQUIRED = {
  PAYLOAD_SERVICE_API_KEY: "service-key",
  BAN_HASH_SALT: "a-salt-of-16-chars",
};

const parse = (extra: Record<string, string | undefined> = {}) =>
  parseEnv({ ...REQUIRED, ...extra });

describe("parseEnv defaults", () => {
  it("fills in every optional setting", () => {
    expect(parse()).toEqual({
      ...REQUIRED,
      PORT: 4000,
      REDIS_URL: "redis://localhost:6379",
      PAYLOAD_URL: "http://localhost:3000",
      WEB_ORIGIN: "http://localhost:5173",
      INACTIVITY_TIMEOUT_MS: 900_000,
      SYNC_INTERVAL_MS: 30_000,
      SOCKET_ADAPTER_KEY: "socket.io",
      ROOM_HISTORY_SIZE: 50,
      ROOM_HISTORY_TTL_SECONDS: 3600,
      AUTH_TOKEN_SECRET: undefined,
      MAX_CONNECTIONS_PER_IP: undefined,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it.each(["", "   "])("treats a blank value (%j) as unset", (blank) => {
    const env = parse({
      PORT: blank,
      SYNC_INTERVAL_MS: blank,
      INACTIVITY_TIMEOUT_MS: blank,
      MAX_CONNECTIONS_PER_IP: blank,
      TRUST_PROXY_HOPS: blank,
      WEB_ORIGIN: blank,
      SOCKET_ADAPTER_KEY: blank,
    });

    expect(env.PORT).toBe(4000);
    expect(env.SYNC_INTERVAL_MS).toBe(30_000);
    expect(env.INACTIVITY_TIMEOUT_MS).toBe(900_000);
    expect(env.MAX_CONNECTIONS_PER_IP).toBeUndefined();
    expect(env.TRUST_PROXY_HOPS).toBe(0);
    expect(env.WEB_ORIGIN).toBe("http://localhost:5173");
    expect(env.SOCKET_ADAPTER_KEY).toBe("socket.io");
  });

  it("ignores variables it does not know", () => {
    expect(() =>
      parse({ PATH: "/usr/bin", SOMETHING_ELSE: "x" }),
    ).not.toThrow();
  });
});

describe("parseEnv numbers", () => {
  it("reads valid values, ignoring surrounding spaces", () => {
    const env = parse({
      PORT: " 8080 ",
      SYNC_INTERVAL_MS: "1",
      INACTIVITY_TIMEOUT_MS: "5000",
      MAX_CONNECTIONS_PER_IP: "10",
      TRUST_PROXY_HOPS: "2",
      ROOM_HISTORY_SIZE: "200",
      ROOM_HISTORY_TTL_SECONDS: "86400",
    });

    expect(env).toMatchObject({
      PORT: 8080,
      SYNC_INTERVAL_MS: 1,
      INACTIVITY_TIMEOUT_MS: 5000,
      MAX_CONNECTIONS_PER_IP: 10,
      ROOM_HISTORY_SIZE: 200,
      ROOM_HISTORY_TTL_SECONDS: 86_400,
      TRUST_PROXY_HOPS: 2,
    });
  });

  it("accepts the edges of the port range", () => {
    expect(parse({ PORT: "1" }).PORT).toBe(1);
    expect(parse({ PORT: "65535" }).PORT).toBe(65535);
  });

  // 0 used to mean "off" for two of these; a magic value or a typo must not quietly switch a protection off.
  it.each([
    ["PORT", "0", /from 1 to 65535.*default of 4000/],
    ["PORT", "65536", /from 1 to 65535/],
    ["PORT", "abc", /from 1 to 65535/],
    ["INACTIVITY_TIMEOUT_MS", "0", /1 or more.*default of 900000/],
    ["INACTIVITY_TIMEOUT_MS", "15m", /1 or more/],
    ["INACTIVITY_TIMEOUT_MS", "never", /1 or more/],
    ["SYNC_INTERVAL_MS", "0", /1 or more.*default of 30000/],
    ["ROOM_HISTORY_SIZE", "0", /from 1 to 200.*default of 50/],
    ["ROOM_HISTORY_SIZE", "fifty", /from 1 to 200/],
    // The web client keeps at most 200 messages, so a longer history would only waste Redis memory.
    ["ROOM_HISTORY_SIZE", "201", /from 1 to 200/],
    ["ROOM_HISTORY_TTL_SECONDS", "0", /from 1 to 604800.*default of 3600/],
    ["ROOM_HISTORY_TTL_SECONDS", "1h", /from 1 to 604800/],
    ["ROOM_HISTORY_TTL_SECONDS", "604801", /from 1 to 604800/],
    ["SYNC_INTERVAL_MS", "30s", /1 or more/],
    ["MAX_CONNECTIONS_PER_IP", "0", /1 or more.*no limit/],
    ["MAX_CONNECTIONS_PER_IP", "10 per ip", /1 or more/],
    ["TRUST_PROXY_HOPS", "-1", /0 or more.*default of 0/],
    ["TRUST_PROXY_HOPS", "1.5", /0 or more/],
    ["TRUST_PROXY_HOPS", "Infinity", /0 or more/],
    ["TRUST_PROXY_HOPS", "1e3", /0 or more/],
    ["TRUST_PROXY_HOPS", "99999999999999999999", /0 or more/],
  ])("rejects %s=%j", (name, value, message) => {
    expect(() => parse({ [name]: value })).toThrow(
      new RegExp(`${name}: .*${message.source}.*got "${value}"`),
    );
  });
});

describe("parseEnv required settings", () => {
  // Optional: without it moderators cannot sign in, and everything else works as before.
  it("accepts AUTH_TOKEN_SECRET, unset, blank or long enough", () => {
    const secret = "s".repeat(32);

    expect(parse().AUTH_TOKEN_SECRET).toBeUndefined();
    expect(
      parse({ AUTH_TOKEN_SECRET: "  " }).AUTH_TOKEN_SECRET,
    ).toBeUndefined();
    expect(parse({ AUTH_TOKEN_SECRET: secret }).AUTH_TOKEN_SECRET).toBe(secret);
  });

  it("rejects a short AUTH_TOKEN_SECRET without printing it", () => {
    const secret = "too-short-secret";

    expect(() => parse({ AUTH_TOKEN_SECRET: secret })).toThrow(
      /AUTH_TOKEN_SECRET: .*at least 32 characters/,
    );

    try {
      parse({ AUTH_TOKEN_SECRET: secret });
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("reports every missing variable at once", () => {
    expect(() => parseEnv({})).toThrow(
      /PAYLOAD_SERVICE_API_KEY: is required[\s\S]*BAN_HASH_SALT: is required/,
    );
  });

  it("treats a blank required value as missing", () => {
    expect(() => parse({ PAYLOAD_SERVICE_API_KEY: "  " })).toThrow(
      /PAYLOAD_SERVICE_API_KEY: is required/,
    );
  });

  it("rejects a short salt without printing it", () => {
    const salt = "short-salt";

    expect(() => parse({ BAN_HASH_SALT: salt })).toThrow(
      /BAN_HASH_SALT: .*at least 16 characters/,
    );

    try {
      parse({ BAN_HASH_SALT: salt });
    } catch (error) {
      expect((error as Error).message).not.toContain(salt);
    }
  });
});

describe("parseEnv URLs", () => {
  it("accepts valid URLs", () => {
    const env = parse({
      REDIS_URL: "rediss://user:pw@redis.example.com:6380/2",
      PAYLOAD_URL: "https://admin.example.com",
      WEB_ORIGIN: "https://chat.example.com",
    });

    expect(env).toMatchObject({
      REDIS_URL: "rediss://user:pw@redis.example.com:6380/2",
      PAYLOAD_URL: "https://admin.example.com",
      WEB_ORIGIN: "https://chat.example.com",
    });
  });

  it.each([
    ["REDIS_URL", "localhost:6379"],
    ["REDIS_URL", "http://localhost:6379"],
    ["PAYLOAD_URL", "localhost:3000"],
    ["PAYLOAD_URL", "ftp://localhost"],
  ])("rejects %s=%j", (name, value) => {
    expect(() => parse({ [name]: value })).toThrow(new RegExp(`${name}: `));
  });

  // Connection strings can carry passwords, so a rejected value must not end up in the logs.
  it("does not print a rejected REDIS_URL", () => {
    const value = "mysql://user:hunter2@redis.example.com";

    expect(() => parse({ REDIS_URL: value })).toThrow(/REDIS_URL: /);

    try {
      parse({ REDIS_URL: value });
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2");
    }
  });

  // CORS compares the Origin header exactly, so a trailing slash or a path would block every browser silently.
  it.each([
    ["a trailing slash", "http://localhost:5173/"],
    ["a path", "https://chat.example.com/app"],
    ["a wildcard", "*"],
    ["no scheme", "chat.example.com"],
  ])("rejects a WEB_ORIGIN with %s", (_label, value) => {
    expect(() => parse({ WEB_ORIGIN: value })).toThrow(/WEB_ORIGIN: .*origin/);
  });
});

describe("parseEnv errors", () => {
  it("lists every invalid setting in one error", () => {
    const run = () =>
      parse({ PORT: "0", SYNC_INTERVAL_MS: "x", REDIS_URL: "nope" });

    expect(run).toThrow(/PORT: /);
    expect(run).toThrow(/SYNC_INTERVAL_MS: /);
    expect(run).toThrow(/REDIS_URL: /);
  });
});
