import assert from "node:assert/strict";
import { test } from "node:test";

import { createChecks, runChecks } from "./check.mjs";

test("empty commits do not format or run tests", () => {
  assert.deepEqual(createChecks("commit"), []);
});

test("commit checks format staged files before lint, types and related tests", () => {
  const checks = createChecks("commit", ["apps/web/src/components/Button.tsx"]);
  assert.ok(checks[0].args.includes("lint-staged"));
  assert.ok(checks.some((check) => check.name === "Lint"));
  assert.ok(checks.some((check) => check.name === "Types"));
  const related = checks.find(
    (check) => check.name === "apps/web related unit tests",
  );
  assert.ok(related.args.includes("related"));
  assert.ok(related.args.at(-1).endsWith("Button.tsx"));
  assert.ok(!checks.some((check) => check.name === "Browser tests"));
  assert.ok(!checks.some((check) => check.name.startsWith("apps/chat-server")));
});

test("shared changes select related tests in both consumers", () => {
  const checks = createChecks("commit", ["shared/chatProtocol.mjs"]);
  assert.equal(
    checks.filter((check) => check.name.endsWith("related unit tests")).length,
    2,
  );
});

test("dependency changes run full unit suites instead of guessing affected tests", () => {
  const checks = createChecks("commit", ["package-lock.json"]);
  assert.equal(
    checks.filter((check) => check.name.endsWith("unit tests")).length,
    2,
  );
  assert.ok(!checks.some((check) => check.args.includes("related")));
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
