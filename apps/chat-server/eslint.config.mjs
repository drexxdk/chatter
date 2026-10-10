import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
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
    // Needs type information, so only for the files the TypeScript project covers.
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/no-deprecated": "error" },
  },
  globalIgnores(["dist/"]),
]);
