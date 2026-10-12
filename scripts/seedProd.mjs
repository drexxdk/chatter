// Runs the seed on the production machine: updates its checkout to origin/main and runs deploy/seed.sh there (see deploy/runbook.md).
//   npm run seed:prod -- <host>       or set DEPLOY_HOST; DEPLOY_USER (deploy) and DEPLOY_SSH_KEY_FILE (~/.ssh/chatter_deploy)
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const host = process.argv[2] ?? process.env.DEPLOY_HOST;
const user = process.env.DEPLOY_USER ?? "deploy";
const key =
  process.env.DEPLOY_SSH_KEY_FILE ?? join(homedir(), ".ssh", "chatter_deploy");

if (!host) {
  console.error("Say which machine: npm run seed:prod -- <host>");
  process.exit(1);
}

// The deploy workflow updates the images but not this checkout, and the seed is built from it. Its tracked files are only
// copies of the repository's (the workflow copies the stack files over them), so they are reset; the settings are not tracked.
const remote =
  "cd /opt/chatter && git fetch -q origin main && git reset -q --hard origin/main && bash deploy/seed.sh";
const result = spawnSync("ssh", ["-i", key, `${user}@${host}`, remote], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
