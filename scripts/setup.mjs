// One-time setup of a fresh clone for local development: installs the dependencies, creates the .env files with
// generated secrets, starts Postgres and Redis (Docker) and seeds the admin database. Safe to run again: it keeps
// every setting that is already filled in and the seed skips what exists. Development only, never use it for a server.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const secret = () => randomBytes(32).toString("hex");
const step = (message) => console.log(`\n==> ${message}`);

function fail(message) {
  console.error(`\nSetup stopped: ${message}`);
  process.exit(1);
}

function run(command, args, { capture = false } = {}) {
  return spawnSync(command, args, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

function valueOf(text, key) {
  return text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1].trim() ?? "";
}

function withValue(text, key, value) {
  const line = new RegExp(`^${key}=.*$`, "m");

  return line.test(text)
    ? text.replace(line, () => `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
}

// Reads the .env file (or the example it is copied from), fills the keys that are empty or still hold a placeholder
// and writes it back when something changed. Returns the text.
function prepareEnv(dir, fill = {}) {
  const target = join(root, dir, ".env");
  const created = !existsSync(target);
  const original = readFileSync(
    created ? join(root, dir, ".env.example") : target,
    "utf8",
  );
  let text = original;

  for (const [key, make] of Object.entries(fill)) {
    const current = valueOf(text, key);

    if (current === "" || current === "YOUR_SECRET_HERE") {
      text = withValue(text, key, make());
    }
  }

  if (created || text !== original) {
    writeFileSync(target, text);
    console.log(`${created ? "Created" : "Updated"} ${dir}/.env`);
  } else {
    console.log(`${dir}/.env is already set up.`);
  }

  return text;
}

const major = Number(process.versions.node.split(".")[0]);

if (major < 20) {
  fail(`Node 20 or newer is needed, this is ${process.versions.node}.`);
}

if (run("docker", ["info"], { capture: true }).status !== 0) {
  fail(
    "Docker is not installed or not running. Start Docker Desktop and run this again.",
  );
}

step("Installing dependencies");

if (run("npm", ["install"]).status !== 0) {
  fail("npm install failed.");
}

step("Creating the .env files");
prepareEnv(".");
prepareEnv("apps/web");
const admin = prepareEnv("apps/admin", { PAYLOAD_SECRET: secret });
let chatServer = prepareEnv("apps/chat-server", {
  BAN_HASH_SALT: secret,
  AUTH_TOKEN_SECRET: secret,
});

step("Starting Postgres and Redis");

if (run("docker", ["compose", "up", "-d", "--wait"]).status !== 0) {
  fail(
    "docker compose could not start Postgres and Redis. Is something else using port 5432 or 6379?",
  );
}

step("Seeding the admin database (first admin, sample rooms, terms, API key)");

const seed = run("npm", ["run", "seed", "--workspace", "apps/admin"], {
  capture: true,
});
const seedOutput = `${seed.stdout}${seed.stderr}`.replace(
  /\u001b\[[0-9;]*m/g,
  "",
);

if (seed.status !== 0) {
  console.error(seedOutput);
  fail("the seed failed (output above).");
}

console.log(
  seedOutput
    .split(/\r?\n/)
    .filter(
      (line) => /INFO:/.test(line) && !/PAYLOAD_SERVICE_API_KEY/.test(line),
    )
    .join("\n"),
);

const printedKey = seedOutput.match(
  /PAYLOAD_SERVICE_API_KEY[\s\S]*?:\s*([0-9a-f]{64})/,
)?.[1];

if (printedKey) {
  chatServer = withValue(chatServer, "PAYLOAD_SERVICE_API_KEY", printedKey);
  writeFileSync(join(root, "apps/chat-server/.env"), chatServer);
  console.log("Saved the chat-server's API key in apps/chat-server/.env.");
} else if (valueOf(chatServer, "PAYLOAD_SERVICE_API_KEY") === "") {
  fail(
    "the database already has the chat-server's account, but its API key is not in apps/chat-server/.env and cannot be shown again.\n" +
      "Reset the local database and run this again: docker compose down -v",
  );
}

console.log(`
Done. Start everything with: npm start
  Chat      http://localhost:5173
  Admin     http://localhost:3000/admin   (${valueOf(admin, "SEED_ADMIN_EMAIL")} / ${valueOf(admin, "SEED_ADMIN_PASSWORD")})
Stop with: npm run stop`);
