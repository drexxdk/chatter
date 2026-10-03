import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // env.ts throws at import time without the first two. The rest are pinned because env.ts also reads a local
    // .env, and the tests must not depend on a developer's own settings (an empty value means "unset").
    env: {
      PAYLOAD_SERVICE_API_KEY: "test-api-key",
      BAN_HASH_SALT: "test-salt",
      MAX_CONNECTIONS_PER_IP: "",
      TRUST_PROXY_HOPS: "0",
      INACTIVITY_TIMEOUT_MS: "900000",
    },
  },
});
