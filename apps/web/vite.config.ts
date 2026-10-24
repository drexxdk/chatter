import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const nodeTests = [
  "src/chat/age.test.ts",
  "src/chat/clock.test.ts",
  "src/chat/gifs.test.ts",
  "src/chat/mentions.test.ts",
  "src/chat/picture.test.ts",
  "src/chat/roomEvents.test.ts",
  "src/chat/runs.test.ts",
  "src/chat/youtube.test.ts",
  "src/components/messagePresentation.test.ts",
  "src/nickname.test.ts",
  "src/profile.test.ts",
  "src/roomThemes.test.ts",
  "src/serverParity.test.ts",
  "scripts/**/*.test.ts",
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // chat-server only allows this origin through CORS.
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/playwright-report/**", "**/test-results/**"],
    },
  },
  test: {
    maxWorkers: 2,
    testTimeout: 15_000,
    reporters: process.env.CI ? ["default", "json"] : ["default"],
    outputFile: { json: "test-results/vitest.json" },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: nodeTests,
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, ...nodeTests],
        },
      },
    ],
  },
});
