// Starts whatever of the development setup is not running yet and leaves the rest alone: Postgres and Redis (Docker),
// the admin app, the chat-server and the web client. A service counts as running when something answers on its port.
import { spawnSync } from "node:child_process";

import { concurrently } from "concurrently";

import { DATABASE_PORTS, SERVICES, listening } from "./services.mjs";

const databaseUp = (await Promise.all(DATABASE_PORTS.map(listening))).every(
  Boolean,
);

if (!databaseUp) {
  console.log("Starting Postgres and Redis...");
  const docker = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
    stdio: ["ignore", "ignore", "inherit"],
    shell: true,
  });

  if (docker.status !== 0) {
    console.error("Could not start Postgres and Redis. Is Docker running?");
    process.exit(1);
  }
}

const running = new Set();

for (const service of SERVICES) {
  if (await listening(service.port)) {
    running.add(service.name);
    console.log(`${service.name} is already running on port ${service.port}.`);
  }
}

const missing = SERVICES.filter((service) => !running.has(service.name));

if (missing.length === 0) {
  console.log("Everything is already running.");
  process.exit(0);
}

// Each service waits for the one it depends on when this run is the one starting that one: the chat-server asks the
// admin app for rooms and bans, and the web client loads its rooms from the chat-server, so a tab that reloads as soon
// as Vite is up would otherwise find nothing to talk to.
const WAITS_FOR = { chat: SERVICES[0], web: SERVICES[1] };
const WAIT_MS = 180_000;
const commands = missing.map((service) => {
  const dependency = WAITS_FOR[service.name];
  const waiting = dependency && !running.has(dependency.name);
  // The web client also waits out the time the chat-server spends waiting for the admin app.
  const timeout = service.name === "web" && !running.has("admin") ? 2 : 1;

  return {
    name: service.name,
    prefixColor: service.color,
    command: waiting
      ? `wait-on --timeout ${WAIT_MS * timeout} tcp:${dependency.port} && ${service.command}`
      : service.command,
  };
});

const { result } = concurrently(commands, {
  killOthersOn: ["failure", "success"],
});

try {
  await result;
} catch {
  // concurrently has already said which command stopped.
  process.exit(1);
}
