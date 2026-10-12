// Opens many guests against a chat-server, has them join rooms and chat, and reports how it held up: how long connecting
// and joining took, how long a message took to come back to its sender, what was refused and why, and how fast /health
// answered meanwhile.
//
//   npm run loadtest -- --url http://localhost:4000 --clients 300 --duration 60
//
// Run it against a server of your own. The per-address connection cap (MAX_CONNECTIONS_PER_IP) counts every guest of this
// script as one address, so against a server that has it set, only that many get in and the rest are reported as
// `too_many_connections`: that is what it is for, but a test of the machine itself needs the cap raised or removed.
// A room that is full turns guests away (`room_full`), so use enough rooms (or rooms without a limit).
import { parseArgs } from "node:util";
import { io } from "socket.io-client";

const { values: options } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:4000" },
    clients: { type: "string", default: "200" },
    // Guests connecting per second.
    ramp: { type: "string", default: "20" },
    // Seconds to stay connected once the last guest has started.
    duration: { type: "string", default: "30" },
    // Seconds between one guest's messages (rooms have a slow mode, 10 s unless set otherwise).
    "message-every": { type: "string", default: "15" },
    // Slugs of the rooms to use, comma separated; every room of the server when left out.
    rooms: { type: "string", default: "" },
    prefix: { type: "string", default: "load" },
    help: { type: "boolean", default: false },
  },
});

if (options.help) {
  console.log(
    "Options: --url, --clients, --ramp (per second), --duration (seconds), --message-every (seconds), --rooms a,b, --prefix",
  );
  process.exit(0);
}

const url = options.url.replace(/\/$/, "");
const clientCount = Number(options.clients);
const rampPerSecond = Number(options.ramp);
const durationMs = Number(options.duration) * 1000;
const messageEveryMs = Number(options["message-every"]) * 1000;
const runId = Math.random().toString(36).slice(2, 6);

for (const [name, value] of Object.entries({
  clients: clientCount,
  ramp: rampPerSecond,
  duration: durationMs,
  "message-every": messageEveryMs,
})) {
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`--${name} must be a positive number`);
    process.exit(2);
  }
}

const connectTimes = [];
const joinTimes = [];
const deliveryTimes = [];
const healthTimes = [];
const failures = new Map();
const counts = {
  started: 0,
  connected: 0,
  joined: 0,
  sent: 0,
  delivered: 0,
  lost: 0,
  dropped: 0,
};

const fail = (what) => failures.set(what, (failures.get(what) ?? 0) + 1);

function percentile(values, p) {
  if (values.length === 0) return "-";
  const sorted = [...values].sort((a, b) => a - b);
  return `${Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))])} ms`;
}

const timing = (label, values) =>
  `${label.padEnd(26)} p50 ${percentile(values, 50)}, p95 ${percentile(values, 95)}, max ${percentile(values, 100)} (${values.length})`;

const response = await fetch(`${url}/rooms`).catch((error) => {
  console.error(`Could not reach ${url}/rooms: ${error.message}`);
  process.exit(1);
});
const allRooms = await response.json();
const wanted = options.rooms ? options.rooms.split(",") : null;
const rooms = allRooms.filter((room) => !wanted || wanted.includes(room.slug));

if (rooms.length === 0) {
  console.error("No rooms to use.");
  process.exit(1);
}

// Guests are dealt out over the rooms, as many as each holds (a room without a limit takes the rest).
const seats = rooms.map((room) => ({
  slug: room.slug,
  left: typeof room.maxMembers === "number" ? room.maxMembers : Infinity,
}));
const capacity = seats.reduce((sum, room) => sum + room.left, 0);

if (capacity < clientCount) {
  console.log(
    `Note: the rooms hold ${capacity} guests together, so ${clientCount - capacity} of ${clientCount} will be turned away.`,
  );
}

const sockets = [];
const stoppers = [];

function startGuest(index) {
  const room = seats.find((candidate) => candidate.left > 0) ?? seats[0];
  room.left -= 1;
  // Distinct names, so nobody is refused for a name somebody else in the room has.
  const nickname = `${options.prefix}-${runId}-${index}`;
  counts.started += 1;

  const startedAt = performance.now();
  const socket = io(url, {
    auth: { nickname },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);

  // What this guest sent and when, to time how long it took to come back.
  const pending = new Map();
  let joined = false;

  socket.on("connect_error", (error) => fail(`connect: ${error.message}`));

  socket.on("connect", () => {
    counts.connected += 1;
    connectTimes.push(performance.now() - startedAt);
    const joinStarted = performance.now();

    socket.emit("room:join", { slug: room.slug }, (ack) => {
      if (!ack?.ok) return fail(`join: ${ack?.error ?? "no answer"}`);
      joined = true;
      counts.joined += 1;
      joinTimes.push(performance.now() - joinStarted);
    });

    const send = () => {
      if (!joined) return;
      const text = `load ${runId} ${index} ${counts.sent}`;
      pending.set(text, performance.now());
      counts.sent += 1;
      socket.emit("message:send", { text }, (ack) => {
        if (!ack?.ok) {
          pending.delete(text);
          fail(`send: ${ack?.error ?? "no answer"}`);
        }
      });
    };

    // Not all at the same moment: each guest starts at its own point of the interval.
    const first = setTimeout(() => {
      send();
      stoppers.push(setInterval(send, messageEveryMs));
    }, Math.random() * messageEveryMs);
    stoppers.push(first);
  });

  socket.on("message:new", (message) => {
    const sentAt = pending.get(message.text);
    if (sentAt === undefined) return;
    pending.delete(message.text);
    counts.delivered += 1;
    deliveryTimes.push(performance.now() - sentAt);
  });

  socket.on("kicked", (payload) => fail(`kicked: ${payload?.reason}`));
  socket.on("disconnect", (reason) => {
    if (reason !== "io client disconnect") {
      counts.dropped += 1;
      fail(`disconnect: ${reason}`);
    }
    counts.lost += pending.size;
  });
}

// How long the machine running this script takes to wake a timer: a slow one would blame the server for its own delay.
let lagMax = 0;
let tick = performance.now();
stoppers.push(
  setInterval(() => {
    const now = performance.now();
    lagMax = Math.max(lagMax, now - tick - 100);
    tick = now;
  }, 100),
);

const probeHealth = async () => {
  const started = performance.now();
  try {
    const result = await fetch(`${url}/health`);
    if (result.ok) healthTimes.push(performance.now() - started);
    else fail(`health: ${result.status}`);
  } catch (error) {
    fail(`health: ${error.message}`);
  }
};
stoppers.push(setInterval(probeHealth, 5000));

console.log(
  `${clientCount} guests at ${rampPerSecond}/s against ${url}, ${rooms.length} room(s), a message every ${options["message-every"]} s each, for ${options.duration} s after the last one starts.`,
);

const report = () =>
  console.log(
    `started ${counts.started}, connected ${counts.connected}, joined ${counts.joined}, sent ${counts.sent}, back ${counts.delivered}, dropped ${counts.dropped}, refused ${[...failures.values()].reduce((a, b) => a + b, 0)}`,
  );
stoppers.push(setInterval(report, 5000));

for (let index = 0; index < clientCount; index += 1) {
  startGuest(index);
  await new Promise((resolve) => setTimeout(resolve, 1000 / rampPerSecond));
}

await new Promise((resolve) => setTimeout(resolve, durationMs));

stoppers.forEach((timer) => {
  clearTimeout(timer);
  clearInterval(timer);
});
await probeHealth();
sockets.forEach((socket) => socket.disconnect());

console.log("\nResult");
report();
console.log(timing("Connecting", connectTimes));
console.log(timing("Joining a room", joinTimes));
console.log(timing("Message back to sender", deliveryTimes));
console.log(timing("GET /health", healthTimes));
console.log(`This machine's timers were up to ${Math.round(lagMax)} ms late.`);

if (failures.size > 0) {
  console.log("\nRefused or failed:");
  for (const [what, count] of [...failures].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${what}`);
  }
}

process.exit(0);
