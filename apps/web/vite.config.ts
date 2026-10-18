import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // chat-server only allows this origin through CORS.
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    // Every file runs in its own worker at once, so a test can be slow on a busy machine without being wrong.
    testTimeout: 15_000,
    // A shared CI runner is several times slower than a development machine, and the few tests that are sensitive to it
    // (focus that settles late, a slow join) pass on a second try.
    retry: process.env.CI ? 2 : 0,
  },
});
