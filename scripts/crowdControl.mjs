// Steers a crowd that is running (npm run crowd):
//
//   npm run crowd:pause     the people stay in the room but stop writing and reacting
//   npm run crowd:resume    they carry on
//   npm run crowd:stop      they leave (add `-- --remove-room` to delete the room as well)
import fs from "node:fs";

import { CONTROL_FILE } from "./crowdFile.mjs";

const [action, ...rest] = process.argv.slice(2);

if (!["pause", "resume", "stop"].includes(action)) {
  console.error("Use: crowdControl.mjs pause | resume | stop [--remove-room]");
  process.exit(2);
}

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(CONTROL_FILE, "utf8"));
  } catch {
    return null;
  }
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const current = read();

if (!current || !alive(current.pid)) {
  fs.rmSync(CONTROL_FILE, { force: true });
  console.log("No crowd is running.");
  process.exit(0);
}

const state = { pause: "paused", resume: "running", stop: "stop" }[action];

fs.writeFileSync(
  CONTROL_FILE,
  JSON.stringify({
    ...current,
    state,
    removeRoom: rest.includes("--remove-room"),
  }),
);

if (action !== "stop") {
  console.log(
    action === "pause" ? "The crowd is paused." : "The crowd is back.",
  );
  process.exit(0);
}

// It leaves by itself within a second or two; one that does not is ended.
for (let waited = 0; waited < 10_000; waited += 250) {
  if (!alive(current.pid)) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

if (alive(current.pid)) {
  process.kill(current.pid, "SIGKILL");
  console.log("The crowd did not answer and was ended.");
} else {
  console.log("The crowd has left.");
}

fs.rmSync(CONTROL_FILE, { force: true });
