import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createChecks, runChecks } from "./check.mjs";

test("empty commits do not format or run tests", () => {
  assert.deepEqual(createChecks("commit"), []);
});

test("commit checks only format and lint staged files without concurrent edits", () => {
  const checks = createChecks("commit", ["apps/web/src/components/Button.tsx"]);
  assert.equal(checks.length, 1);
  assert.deepEqual(checks[0].args, [
    "exec",
    "--",
    "lint-staged",
    "--concurrent",
    "false",
  ]);
});

test("shared, dependency, config and admin changes never expand commit checks", () => {
  for (const file of [
    "shared/chatProtocol.mjs",
    "package-lock.json",
    "package.json",
    "apps/web/vitest.config.ts",
    "apps/chat-server/tsconfig.json",
    "apps/admin/src/env.ts",
    "README.md",
  ]) {
    assert.deepEqual(
      createChecks("commit", [file]),
      createChecks("commit", ["apps/web/src/components/Button.tsx"]),
      file,
    );
  }
});

test("staged linting auto-fixes only supplied files using each workspace config", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    manifest["lint-staged"]["*"],
    "prettier --write --ignore-unknown",
  );
  assert.equal(Object.keys(manifest["lint-staged"]).at(-1), "*");
  for (const workspace of ["apps/web", "apps/chat-server", "apps/admin"]) {
    assert.equal(
      manifest["lint-staged"][
        `${workspace}/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`
      ],
      `npm exec --workspace ${workspace} -- eslint --fix --no-warn-ignored`,
    );
  }
});

test("full checks include both unit suites, admin env, builds and E2E without changing env files", () => {
  const checks = createChecks("push");
  assert.deepEqual(checks[0].args, ["run", "format:check"]);
  for (const name of [
    "apps/web unit tests",
    "apps/chat-server unit tests",
    "Admin environment tests",
    "Chat-server build",
    "Web build",
    "Browser tests",
  ]) {
    assert.ok(
      checks.some((check) => check.name === name),
      name,
    );
  }
  assert.equal(checks.at(-1).env.E2E_TURNSTILE, "false");
  assert.ok(
    checks.find((check) => check.name === "apps/chat-server unit tests").env
      .TEST_REDIS_URL,
  );
  assert.ok(!checks.some((check) => check.args.includes("lint-staged")));
});

test("invalid modes fail instead of silently skipping validation", () => {
  assert.throws(() => createChecks("unknown"), /Use npm run/);
});

test("a failed check blocks later checks and reports its name", () => {
  const calls = [];
  assert.throws(
    () =>
      runChecks(
        [
          { name: "Types", args: ["run", "typecheck"] },
          { name: "Browser tests", args: ["run", "test:e2e"] },
        ],
        {
          npmCli: "npm-cli.js",
          execute: (...args) => {
            calls.push(args);
            return { status: 1 };
          },
        },
      ),
    /Types failed/,
  );
  assert.equal(calls.length, 1);
});

test("checks use the Node executable and argument arrays on every platform", () => {
  const calls = [];
  runChecks(
    [
      {
        name: "Related",
        args: ["exec", "--", "file with spaces.ts"],
        env: { CHECK_PROBE: "yes" },
      },
    ],
    {
      npmCli: "C:/path with spaces/npm-cli.js",
      execute: (...args) => {
        calls.push(args);
        return { status: 0 };
      },
    },
  );
  assert.equal(calls[0][0], process.execPath);
  assert.deepEqual(calls[0][1], [
    "C:/path with spaces/npm-cli.js",
    "exec",
    "--",
    "file with spaces.ts",
  ]);
  assert.equal(calls[0][2].env.CHECK_PROBE, "yes");
  assert.equal(calls[0][2].shell, undefined);
});
