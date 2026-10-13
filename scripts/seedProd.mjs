// Runs the seed on the production machine: updates its checkout to origin/main and runs deploy/seed.sh there (see deploy/runbook.md).
//   npm run seed:prod
// The machine is the API's DuckDNS name, which follows its IP; DEPLOY_HOST, DEPLOY_USER (deploy) and DEPLOY_SSH_KEY_FILE
// (~/.ssh/chatter_deploy) change that.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const host = process.env.DEPLOY_HOST ?? "chatter-drexx-api.duckdns.org";
const user = process.env.DEPLOY_USER ?? "deploy";
const key =
  process.env.DEPLOY_SSH_KEY_FILE ?? join(homedir(), ".ssh", "chatter_deploy");

// The deploy workflow updates the images but not this checkout, and the seed is built from it. Its tracked files are only
// copies of the repository's (the workflow copies the stack files over them), so they are reset; the settings are not tracked.
const remote =
  "cd /opt/chatter && git fetch -q origin main && git reset -q --hard origin/main && bash deploy/seed.sh";
const result = spawnSync(
  "ssh",
  [
    "-i",
    key,
    "-o",
    "StrictHostKeyChecking=accept-new",
    `${user}@${host}`,
    remote,
  ],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
