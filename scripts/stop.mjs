// Stops the admin app, the chat-server and the web client, whatever started them. Postgres and Redis keep running
// (they are slow to start and hold the data) unless `--all` is given. Only the development ports are touched, so the
// servers of an end-to-end run (4100, 5174) are left alone.
import { spawnSync } from "node:child_process";

import { SERVICES, listening } from "./services.mjs";

const windows = process.platform === "win32";

// The processes accepting connections on the port.
function pidsOn(port) {
  const result = windows
    ? spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess }`,
        ],
        { encoding: "utf8" },
      )
    : spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
        encoding: "utf8",
      });

  return [
    ...new Set(
      (result.stdout ?? "")
        .split(/\s+/)
        .filter((pid) => /^\d+$/.test(pid) && Number(pid) > 0),
    ),
  ];
}

// The process and what it started, so a dev server's workers do not outlive it.
function stop(pid) {
  if (windows) {
    spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

async function gone(port) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await listening(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

let failed = false;

// Looked up for all of them before any is stopped: stopping one can end the others too (`npm start` stops them all
// when one of them goes), and they would then wrongly be reported as not having been running.
const found = SERVICES.map((service) => ({
  service,
  pids: pidsOn(service.port),
}));

found.forEach(({ pids }) => pids.forEach(stop));

for (const { service, pids } of found) {
  if (pids.length === 0) {
    console.log(`${service.name}: was not running.`);
  } else if (await gone(service.port)) {
    console.log(`${service.name}: stopped.`);
  } else {
    failed = true;
    console.error(
      `${service.name}: still answers on port ${service.port} after being stopped.`,
    );
  }
}

if (process.argv.includes("--all")) {
  console.log("Stopping Postgres and Redis...");
  const docker = spawnSync("docker", ["compose", "stop"], {
    stdio: ["ignore", "ignore", "inherit"],
    shell: true,
  });

  if (docker.status !== 0) {
    failed = true;
    console.error("Could not stop Postgres and Redis. Is Docker running?");
  }
}

process.exit(failed ? 1 : 0);
