// Sends the settings in deploy/chat-server.env to the production machine and recreates the chat-server with them.
//   npm run env:push            (only restarts when something changed)
//   npm run env:push -- --restart
// Every setting with a value here replaces the one on the machine, or is added; an empty one is sent too (that turns a
// provider off), except the three the machine made for itself, which are never overwritten with nothing. Settings that
// are not in this file are left alone. Values are never printed. DEPLOY_HOST, DEPLOY_USER (deploy) and
// DEPLOY_SSH_KEY_FILE (~/.ssh/chatter_deploy) change where it goes, as for seed:prod.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const host = process.env.DEPLOY_HOST ?? "chatter-drexx-api.duckdns.org";
const user = process.env.DEPLOY_USER ?? "deploy";
const key =
  process.env.DEPLOY_SSH_KEY_FILE ?? join(homedir(), ".ssh", "chatter_deploy");
const LOCAL_FILE = "deploy/chat-server.env";
const REMOTE_FILE = "/opt/chatter/deploy/chat-server.env";
const COMPOSE =
  "docker compose --env-file deploy/stack.env -f docker-compose.prod.yml";
// Made on the machine (by the seed or by hand), so an empty copy here must not wipe them.
const KEPT_WHEN_EMPTY = new Set([
  "PAYLOAD_SERVICE_API_KEY",
  "BAN_HASH_SALT",
  "AUTH_TOKEN_SECRET",
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function ssh(remote, input) {
  const result = spawnSync(
    "ssh",
    [
      "-i",
      key,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=15",
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${user}@${host}`,
      remote,
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );
  if (result.status !== 0) fail(`ssh failed (${result.status}).`);
  return result.stdout;
}

function settingsOf(text) {
  const settings = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) settings.set(match[1], match[2].trim());
  }
  return settings;
}

let localText;
try {
  localText = readFileSync(LOCAL_FILE, "utf8");
} catch {
  fail(`${LOCAL_FILE} not found: copy ${LOCAL_FILE}.example and fill it in.`);
}
const local = settingsOf(localText);
const placeholders = [...local]
  .filter(([, value]) => value.includes(".example."))
  .map(([name]) => name);
if (placeholders.length > 0) {
  fail(`Still an example value in ${LOCAL_FILE}: ${placeholders.join(", ")}.`);
}

const remoteLines = ssh(`cat ${REMOTE_FILE}`).split(/\r?\n/);
if (remoteLines.at(-1) === "") remoteLines.pop();
const remote = settingsOf(remoteLines.join("\n"));

const added = [];
const changed = [];
for (const [name, value] of local) {
  if (value === "" && (KEPT_WHEN_EMPTY.has(name) || !remote.has(name)))
    continue;
  if (remote.get(name) === value) continue;
  (remote.has(name) ? changed : added).push(name);
}

const touched = new Set([...added, ...changed]);
const merged = [];
const written = new Set();
for (const line of remoteLines) {
  const name = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
  if (name && touched.has(name)) {
    // A name that appears twice on the machine is written once.
    if (!written.has(name)) merged.push(`${name}=${local.get(name)}`);
    written.add(name);
  } else {
    merged.push(line);
  }
}
for (const name of added) merged.push(`${name}=${local.get(name)}`);

const forceRestart = process.argv.includes("--restart");
if (touched.size === 0 && !forceRestart) {
  console.log("The machine already has these settings. Nothing to do.");
  process.exit(0);
}

if (touched.size > 0) {
  ssh(
    `set -e; umask 077; cp -p ${REMOTE_FILE} ${REMOTE_FILE}.bak; cat > ${REMOTE_FILE}.tmp; mv ${REMOTE_FILE}.tmp ${REMOTE_FILE}`,
    `${merged.join("\n")}\n`,
  );
  if (added.length > 0) console.log(`Added: ${added.join(", ")}`);
  if (changed.length > 0) console.log(`Changed: ${changed.join(", ")}`);
}

console.log("Recreating the chat-server...");
const restart = spawnSync(
  "ssh",
  [
    "-i",
    key,
    "-o",
    "BatchMode=yes",
    `${user}@${host}`,
    `cd /opt/chatter && ${COMPOSE} up -d --force-recreate chat-server`,
  ],
  { stdio: "inherit" },
);
if (restart.status !== 0) fail("Could not recreate the chat-server.");

const base = (local.get("PUBLIC_API_URL") || `https://${host}`).replace(
  /\/$/,
  "",
);
for (let attempt = 0; attempt < 15; attempt += 1) {
  try {
    const response = await fetch(`${base}/auth/providers`);
    if (response.ok) {
      console.log(`${base}/auth/providers: ${await response.text()}`);
      process.exit(0);
    }
  } catch {
    // The server is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
fail(`The chat-server did not answer at ${base}/auth/providers in time.`);
