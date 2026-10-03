import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // env.ts throws at import time without these.
    env: {
      PAYLOAD_SERVICE_API_KEY: "test-api-key",
      BAN_HASH_SALT: "test-salt",
      // Tests that exercise the per-IP cap pass their own limit; the shared server must not hit it.
      MAX_CONNECTIONS_PER_IP: "0",
    },
  },
});
