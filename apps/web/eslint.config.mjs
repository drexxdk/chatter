import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

// Not import.meta.dirname: older Node versions (such as the one an editor may run ESLint with) do not have it.
const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^(_|ignore)",
        },
      ],
    },
  },
  {
    // Config and Playwright files run in Node.
    files: ["*.{ts,mjs}", "e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Fakes and assertions are looser than the app on purpose.
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // Needs type information, so only for the files the TypeScript project covers.
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: here,
      },
    },
    rules: { "@typescript-eslint/no-deprecated": "error" },
  },
  globalIgnores(["dist/", "playwright-report/", "test-results/"]),
]);
