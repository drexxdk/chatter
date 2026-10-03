import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // env.ts throws at import time without these.
    env: {
      PAYLOAD_SERVICE_API_KEY: "test-api-key",
      BAN_HASH_SALT: "test-salt",
    },
  },
});
