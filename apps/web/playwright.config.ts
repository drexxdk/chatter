import { defineConfig, devices } from "@playwright/test";

import { CHAT_SERVER_URL, E2E, WEB_URL } from "./e2e/constants";

export default defineConfig({
  testDir: "./e2e",
  // The tests share one chat-server (and one loopback IP, which the ban test blocks), so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/globalSetup.ts",
  use: {
    baseURL: WEB_URL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: [
    {
      // Real chat-server, isolated from a dev instance by its own port, Redis database and adapter channel.
      command: "npx tsx src/index.ts",
      cwd: "../chat-server",
      url: `${CHAT_SERVER_URL}/health`,
      reuseExistingServer: false,
      stderr: "pipe",
      env: {
        PORT: String(E2E.chatServerPort),
        REDIS_URL: E2E.redisUrl,
        PAYLOAD_URL: E2E.payloadUrl,
        SOCKET_ADAPTER_KEY: E2E.socketAdapterKey,
        BAN_HASH_SALT: E2E.banHashSalt,
        AUTH_TOKEN_SECRET: E2E.authTokenSecret,
        SYNC_INTERVAL_MS: String(E2E.syncIntervalMs),
        DEFAULT_SLOW_MODE_SECONDS: String(E2E.defaultSlowModeSeconds),
        ROOM_HISTORY_SIZE: "200",
        // Lets a test give a guest its own address through X-Forwarded-For, so a ban can hit one guest of several.
        TRUST_PROXY_HOPS: "1",
        // Every test opens the lobby from the same address, which would pass the production limit.
        ROOMS_RATE_LIMIT_PER_MINUTE: "100000",
        WEB_ORIGIN: WEB_URL,
        // The stand-in provider, so the sign-in with an account can be tried without Google, Facebook or Discord.
        DEV_OAUTH: "true",
        PUBLIC_API_URL: CHAT_SERVER_URL,
        TURNSTILE_SITE_KEY:
          process.env.E2E_TURNSTILE === "true"
            ? "1x00000000000000000000AA"
            : "",
        TURNSTILE_SECRET_KEY:
          process.env.E2E_TURNSTILE === "true"
            ? "1x0000000000000000000000000000000AA"
            : "",
        TURNSTILE_TEST_MODE: "false",
      },
    },
    {
      command: `npx vite --port ${E2E.webPort} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      env: {
        VITE_CHAT_SERVER_URL: CHAT_SERVER_URL,
        VITE_GIPHY_API_KEY: "e2e-test-key",
      },
    },
  ],
});
