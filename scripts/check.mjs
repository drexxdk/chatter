import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCheck = (name, ...args) => ({ name, args });

export function createChecks(mode, files = []) {
  if (mode !== "commit" && mode !== "push")
    throw new Error("Use npm run check:commit or npm run check.");
  if (mode === "commit") {
    return files.length === 0
      ? []
      : [
          npmCheck(
            "Format and lint staged files",
            "exec",
            "--",
            "lint-staged",
            "--concurrent",
            "false",
          ),
        ];
  }

  const checks = [
    npmCheck("Formatting", "run", "format:check"),
    {
      name: "Check-runner tests",
      node: true,
      args: ["--test", "scripts/check.test.mjs"],
    },
    npmCheck("Lint", "run", "lint"),
    npmCheck("Types", "run", "typecheck"),
  ];

  for (const workspace of ["apps/chat-server", "apps/web"]) {
    const check = npmCheck(
      `${workspace} unit tests`,
      "test",
      "--workspace",
      workspace,
    );
    if (workspace === "apps/chat-server") {
      check.env = {
        TEST_REDIS_URL:
          process.env.TEST_REDIS_URL || "redis://localhost:6379/9",
      };
    }
    checks.push(check);
  }

  checks.push(
    npmCheck(
      "Admin environment tests",
      "exec",
      "--workspace",
      "apps/admin",
      "--",
      "vitest",
      "run",
      "--config",
      "./vitest.config.mts",
      "tests/int/env.int.spec.ts",
    ),
    npmCheck(
      "Chat-server build",
      "run",
      "build",
      "--workspace",
      "apps/chat-server",
    ),
    npmCheck("Web build", "run", "build", "--workspace", "apps/web"),
    {
      ...npmCheck(
        "Browser tests",
        "run",
        "test:e2e",
        "--workspace",
        "apps/web",
      ),
      env: { E2E_TURNSTILE: "false" },
    },
  );
  return checks;
}

export function runChecks(
  checks,
  { execute = spawnSync, npmCli = process.env.npm_execpath } = {},
) {
  for (const check of checks) {
    console.log(`\n==> ${check.name}`);
    if (!check.node && !npmCli)
      throw new Error("Run this check through npm so its CLI can be found.");
    const result = execute(
      process.execPath,
      check.node ? check.args : [npmCli, ...check.args],
      {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, ...check.env },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `${check.name} failed. Fix the reported problem and retry.`,
      );
  }
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr || "Unable to read the Git working tree.");
  return result.stdout;
}

async function requireServices() {
  try {
    await new Promise((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port: 6379 });
      socket.setTimeout(3000);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", reject);
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("Redis connection timed out"));
      });
    });
    const response = await fetch("http://localhost:3000/api/globals/legal", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Admin returned HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      "Full checks require local Redis on :6379 and a seeded admin on :3000. " +
        "Start the local services first (npm start). " +
        error.message,
    );
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "install") {
    if (
      process.env.CI ||
      process.env.NODE_ENV === "production" ||
      process.env.HUSKY === "0" ||
      !existsSync(join(root, ".git"))
    )
      return;
    const configuredHooks = spawnSync(
      "git",
      ["config", "--local", "--get", "core.hooksPath"],
      { cwd: root, encoding: "utf8" },
    ).stdout.trim();
    if (
      configuredHooks &&
      resolve(root, configuredHooks) !== join(root, ".husky", "_")
    )
      throw new Error(
        "A custom core.hooksPath is already configured. Integrate the Chatter hooks there or remove that setting before running npm run prepare.",
      );
    const husky = (await import("husky")).default;
    const message = husky();
    if (message) throw new Error(message);
    return;
  }

  const files =
    mode === "commit"
      ? git("diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z")
          .split("\0")
          .filter(Boolean)
      : [];
  const checks = createChecks(mode, files);
  if (process.argv.includes("--dry-run")) {
    for (const check of checks)
      console.log(`${check.name}: ${check.args.join(" ")}`);
    return;
  }
  if (mode === "push") await requireServices();
  runChecks(checks);
  console.log(
    checks.length ? "\nAll checks passed." : "No staged files to check.",
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(`\nChecks stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
