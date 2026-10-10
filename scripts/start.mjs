// Starts whatever of the development setup is not running yet and leaves the rest alone: Postgres and Redis (Docker),
// the admin app, the chat-server and the web client. A service counts as running when something answers on its port.
import { spawnSync } from "node:child_process";
import net from "node:net";

import { concurrently } from "concurrently";

const DATABASE_PORTS = [5432, 6379];

const SERVICES = [
  { name: "admin", port: 3000, command: "npm run dev:admin", color: "blue" },
  {
    name: "chat",
    port: 4000,
    command: "npm run dev:chat-server",
    color: "green",
  },
  { name: "web", port: 5173, command: "npm run dev:web", color: "magenta" },
];

function answers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

// Servers may listen on IPv4 or IPv6 only, depending on how they bind "localhost".
async function listening(port) {
  const results = await Promise.all(
    ["127.0.0.1", "::1"].map((host) => answers(port, host)),
  );

  return results.some(Boolean);
}

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

// The chat-server asks the admin app for rooms and bans, so it waits for it when this run is the one starting it.
const waitForAdmin = SERVICES[0];
const commands = missing.map((service) => ({
  name: service.name,
  prefixColor: service.color,
  command:
    service.name === "chat" && !running.has(waitForAdmin.name)
      ? `wait-on --timeout 180000 tcp:${waitForAdmin.port} && ${service.command}`
      : service.command,
}));

const { result } = concurrently(commands, {
  killOthersOn: ["failure", "success"],
});

try {
  await result;
} catch {
  // concurrently has already said which command stopped.
  process.exit(1);
}
