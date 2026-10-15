// Fills a room of the dev chat-server with emulated people who chat like a crowd: they come in over a little while, write
// (some often, most now and then, some never), answer each other by name, react to messages, and leave and are replaced.
// It makes the room itself in the admin (limit people + 1, so one seat is left for you) unless it is there already.
//
//   npm run crowd                          99 people in the room "crowd"
//   npm run crowd -- --people 40 --speed 2 40 people, twice as lively
//   npm run crowd -- --remove-room         delete the room when stopped (Ctrl+C)
//
// Every person is a real connection to the chat-server, so the per-address cap (MAX_CONNECTIONS_PER_IP in
// apps/chat-server/.env) has to be above the number of people; it is the cause when many are refused with
// `too_many_connections`. The admin and the chat-server must be running (npm start).
import fs from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import { io } from "socket.io-client";

import { CONTROL_FILE } from "./crowdFile.mjs";

const { values: options } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:4000" },
    admin: { type: "string", default: "http://localhost:3000" },
    slug: { type: "string", default: "crowd" },
    name: { type: "string", default: "Crowd" },
    people: { type: "string", default: "99" },
    // Seconds over which the first people come in.
    ramp: { type: "string", default: "30" },
    // How lively they are: 2 is twice as many messages, 0.5 half.
    speed: { type: "string", default: "1" },
    // Whether people leave (after 10 to 60 minutes) and are replaced by others.
    "no-churn": { type: "boolean", default: false },
    "remove-room": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (options.help) {
  console.log(
    "Options: --people N, --slug, --name, --ramp seconds, --speed factor, --no-churn, --remove-room, --url, --admin",
  );
  process.exit(0);
}

const url = options.url.replace(/\/$/, "");
const adminUrl = options.admin.replace(/\/$/, "");
const slug = options.slug;
const people = Number(options.people);
const rampMs = Number(options.ramp) * 1000;
const speed = Number(options.speed);

for (const [name, value] of Object.entries({ people, speed })) {
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`--${name} must be a positive number`);
    process.exit(2);
  }
}

const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const later = (ms, fn) => setTimeout(fn, ms);

// --- The room, made in the admin -------------------------------------------------------------------------------------

async function ensureRoom() {
  const env = parseEnv(
    fs.readFileSync(new URL("../apps/admin/.env", import.meta.url), "utf8"),
  );

  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "apps/admin/.env needs SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD",
    );
  }

  const login = await fetch(`${adminUrl}/api/admins/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!login.ok) throw new Error(`Admin login failed: ${login.status}`);

  const { token } = await login.json();
  const request = async (path, init = {}) => {
    const response = await fetch(`${adminUrl}/api/${path}`, {
      signal: AbortSignal.timeout(30_000),
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Admin ${init.method ?? "GET"} ${path}: ${response.status}`,
      );
    }

    return response.json();
  };

  const found = await request(
    `public-rooms?where[slug][equals]=${encodeURIComponent(slug)}`,
  );
  const body = JSON.stringify({
    name: options.name,
    slug,
    maxMembers: people + 1,
    slowModeSeconds: 10,
    description: "Emulated people, for seeing the chat with a crowd in it.",
  });

  if (found.docs?.[0]) {
    const { id } = found.docs[0];
    await request(`public-rooms/${id}`, { method: "PATCH", body });
    return { id, request };
  }

  const { doc } = await request("public-rooms", { method: "POST", body });
  return { id: doc.id, request };
}

// The chat-server reads the rooms from the admin now and then, so a new one is not there at once.
async function waitForRoom() {
  const started = Date.now();

  while (Date.now() - started < 90_000) {
    try {
      const rooms = await (await fetch(`${url}/rooms`)).json();
      const room = rooms.find((candidate) => candidate.slug === slug);

      if (room?.maxMembers === people + 1) return;
    } catch {
      // The chat-server is not up yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    `The chat-server did not list "${slug}" with room for ${people + 1}.`,
  );
}

// --- Who they are ----------------------------------------------------------------------------------------------------

const FIRST_NAMES = [
  "Mikkel",
  "Sofie",
  "Emil",
  "Freja",
  "Oliver",
  "Ida",
  "Magnus",
  "Clara",
  "Lukas",
  "Emma",
  "Jonas",
  "Maja",
  "Anders",
  "Laura",
  "Rasmus",
  "Nanna",
  "Thomas",
  "Sara",
  "Jesper",
  "Julie",
  "Mads",
  "Camilla",
  "Peter",
  "Line",
  "Daniel",
  "Katrine",
  "Simon",
  "Mette",
  "Niels",
  "Signe",
  "James",
  "Olivia",
  "Jack",
  "Amelia",
  "Harry",
  "Grace",
  "Noah",
  "Lily",
  "Ben",
  "Chloe",
  "Sam",
  "Ella",
  "Max",
  "Hannah",
  "Felix",
  "Lena",
  "Jan",
  "Sabine",
  "Tobias",
  "Marie",
  "Paul",
  "Anna",
  "Leon",
  "Mia",
  "Finn",
  "Nora",
  "Elias",
  "Greta",
  "Tim",
  "Alma",
];
const WORDS = [
  "night",
  "coffee",
  "river",
  "pixel",
  "mountain",
  "sunny",
  "quiet",
  "wild",
  "lucky",
  "cosmic",
  "retro",
  "little",
];
const THINGS = [
  "owl",
  "fox",
  "panda",
  "wolf",
  "heron",
  "otter",
  "badger",
  "raven",
  "lynx",
  "seal",
  "moth",
  "bear",
];

const takenNames = new Set();

function makeName() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const first = pick(FIRST_NAMES);
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const year = String(rand(70, 99) | 0);
    const name = pick([
      () => `${first}${year}`,
      () => `${first}_${letter.toLowerCase()}`,
      () => `${first} ${letter}.`,
      () => first,
      () => `${first.toLowerCase()}${rand(1, 99) | 0}`,
      () => `${pick(WORDS)}${pick(THINGS)}`,
      () => `${pick(WORDS)}_${pick(THINGS)}${rand(1, 9) | 0}`,
    ])();

    if (
      name.length >= 2 &&
      name.length <= 24 &&
      !takenNames.has(name.toLowerCase())
    ) {
      takenNames.add(name.toLowerCase());
      return name;
    }
  }

  const fallback = `guest${rand(1000, 99999) | 0}`;
  takenNames.add(fallback);
  return fallback;
}

const PICTURE_STYLES = ["lorelei", "pixel-art", "critters", "thumbs"];
const SEED_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const randomPicture = () =>
  `${pick(PICTURE_STYLES)}:${Array.from({ length: 10 }, () => pick([...SEED_ALPHABET])).join("")}`;

function makeProfile() {
  const gender = pick([
    ...Array(8).fill("male"),
    ...Array(8).fill("female"),
    "trans",
    ...Array(3).fill("other"),
  ]);

  return {
    nickname: makeName(),
    avatar: gender,
    ...(chance(0.7) ? { picture: randomPicture() } : {}),
    ...(chance(0.65) ? { age: 18 + Math.floor(rand(0, 1) ** 2 * 47) } : {}),
  };
}

// How often each kind of person writes (mean seconds between messages) and how often they react to what they read. (About one reaction for each message in all, as in a real room.)
const PERSONAS = [
  { kind: "chatty", weight: 12, everyS: 30, reacts: 0.012 },
  { kind: "regular", weight: 40, everyS: 110, reacts: 0.008 },
  { kind: "quiet", weight: 28, everyS: 420, reacts: 0.006 },
  { kind: "lurker", weight: 20, everyS: Infinity, reacts: 0.01 },
];

function makePersona() {
  const total = PERSONAS.reduce((sum, persona) => sum + persona.weight, 0);
  let at = Math.random() * total;

  for (const persona of PERSONAS) {
    at -= persona.weight;
    if (at <= 0) return persona;
  }

  return PERSONAS[1];
}

// --- What they say ---------------------------------------------------------------------------------------------------

const SAYINGS = {
  greetings: [
    "hi everyone",
    "hey!",
    "hello :)",
    "evening all",
    "hej alle sammen",
    "godaften",
    "hallo zusammen",
    "morning!",
    "hey, anyone up?",
    "hi, new here",
    "yo",
    "hej hej",
    "back again",
  ],
  talk: [
    "so what is everyone doing tonight?",
    "just got home from work, so tired",
    "anyone watched anything good lately?",
    "i cannot decide what to eat",
    "this weather though",
    "my cat just knocked a glass off the table",
    "does anyone else listen to music while working?",
    "long day",
    "i need more coffee",
    "weekend plans?",
    "just finished a really good book",
    "anyone here from copenhagen?",
    "i am learning guitar, it is going slowly",
    "what is your favourite season?",
    "i think i will go for a walk",
    "why is it so quiet in here today",
    "pizza or burger?",
    "just had the best sandwich of my life",
    "who is up for a game later?",
    "i keep forgetting my umbrella",
    "så meget regn i dag",
    "jeg er så træt i dag",
    "hvad skal du i weekenden?",
    "nogen der har set den nye serie?",
    "kaffe er livet",
    "godt vejr i dag faktisk",
    "ich brauche Urlaub",
    "wie war euer Tag?",
    "gleich gibt es Pizza",
    "anyone else's internet acting up?",
    "trying to cook something new",
    "haha that is so true",
    "lol",
    "same here",
    "no way",
    "that is wild",
    "honestly yes",
    "good point",
    "i was just thinking that",
    "interesting",
    "fair enough",
    "oh nice",
    "wait what",
    "ha, classic",
  ],
  questions: [
    "does anyone know a good podcast?",
    "what music are you into?",
    "any tips for learning danish?",
    "how long have you all been here?",
    "what do you do for work?",
    "anyone play chess?",
    "what is the best movie you saw this year?",
    "do you prefer mornings or nights?",
    "is it just me or is today slow?",
    "what game are you playing right now?",
  ],
  emoji: [
    "😂",
    "👍",
    "🙂",
    "😅",
    "🔥",
    "😊",
    "🤔",
    "👏",
    "🎉",
    "😮",
    "haha 😂",
    "nice 👍",
    "love it ❤️",
    "yesss",
  ],
  long: [
    "ok so this happened today. i went to the shop to buy milk, and of course they were out of everything i actually needed, so i walked to the other one, and then it started raining",
    "i have been trying to decide for weeks whether to learn a new language or pick up a new instrument, and honestly i think i would just end up doing neither because i get busy",
    "tip if you ever travel by train: book the seats early, bring snacks, and download your music before you go because the wifi is never as good as they say it is",
  ],
  multiline: [
    "three things i need today:\ncoffee\nmore coffee\na nap",
    "my plan for tonight\n1. food\n2. sofa\n3. series",
  ],
  replies: [
    "haha yes",
    "i agree",
    "same!",
    "that is funny",
    "good one",
    "no idea honestly",
    "i was wondering that too",
    "tell me more",
    "oh really?",
    "i think so too",
    "not sure about that",
    "interesting point",
    "lol true",
    "ja det er rigtigt",
    "enig!",
    "haha godt set",
    "stimmt!",
    "genau",
    "me too",
    "depends i guess",
  ],
};

function sayAnything(recent) {
  const roll = Math.random();

  if (recent.length > 0 && roll < 0.32) {
    const other = pick(recent);
    return `@${other.nickname} ${pick(SAYINGS.replies)}`;
  }

  if (roll < 0.4) return pick(SAYINGS.greetings);
  if (roll < 0.5) return pick(SAYINGS.questions);
  if (roll < 0.62) return pick(SAYINGS.emoji);
  if (roll < 0.66) return pick(SAYINGS.long);
  if (roll < 0.69) return pick(SAYINGS.multiline);
  return pick(SAYINGS.talk);
}

const reactionList = fs
  .readFileSync(
    new URL("../apps/chat-server/src/reactions.ts", import.meta.url),
    "utf8",
  )
  .match(/REACTION_EMOJIS\s*=\s*\[([\s\S]*?)\]/)?.[1]
  .match(/"([^"]+)"/g)
  ?.map((quoted) => quoted.slice(1, -1)) ?? ["👍"];
const pickReaction = () =>
  chance(0.7) ? pick(reactionList.slice(0, 4)) : pick(reactionList);

// --- The crowd -------------------------------------------------------------------------------------------------------

const stats = { joined: 0, sent: 0, reacted: 0, left: 0, refused: new Map() };
const refuse = (why) =>
  stats.refused.set(why, (stats.refused.get(why) ?? 0) + 1);
const bots = new Set();
// The last people to have written, for others to answer.
const recent = [];
let stopping = false;
// Told by npm run crowd:pause: they stay where they are and say and do nothing.
let paused = false;
let mentionedTooMany = false;

function startBot() {
  if (stopping) return;

  const profile = makeProfile();
  const persona = makePersona();
  const socket = io(url, {
    auth: profile,
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  const bot = {
    socket,
    profile,
    timers: new Set(),
    inRoom: false,
    guestId: null,
  };
  bots.add(bot);

  const wait = (ms, fn) => {
    const timer = later(ms, () => {
      bot.timers.delete(timer);
      fn();
    });
    bot.timers.add(timer);
  };

  const leave = (replaceInMs) => {
    if (!bots.delete(bot)) return;

    bot.timers.forEach(clearTimeout);
    socket.disconnect();
    takenNames.delete(profile.nickname.toLowerCase());
    stats.left += 1;
    if (replaceInMs !== undefined) later(replaceInMs, startBot);
  };

  const write = (text) => {
    if (paused) return;

    socket.emit("message:send", { text }, (ack) => {
      if (ack?.ok) return void (stats.sent += 1);
      if (ack?.error === "rate_limited") {
        return wait((ack.retryAfterMs ?? 5000) + rand(500, 3000), () =>
          write(text),
        );
      }
      refuse(`send: ${ack?.error ?? "no answer"}`);
    });
  };

  const scheduleMessage = () => {
    if (persona.everyS === Infinity) return;

    // Roughly exponential gaps, so there are bursts and silences as in a real room.
    const gap = -Math.log(1 - Math.random()) * persona.everyS * 1000;
    wait(Math.max(4000, gap / speed), () => {
      if (bot.inRoom)
        write(
          sayAnything(
            recent.filter((who) => who.nickname !== profile.nickname),
          ),
        );
      scheduleMessage();
    });
  };

  socket.on("connect_error", (error) => {
    refuse(`connect: ${error.message}`);
    if (error.message === "too_many_connections" && !mentionedTooMany) {
      mentionedTooMany = true;
      console.log(
        "\nThe chat-server refuses more connections from this address: raise MAX_CONNECTIONS_PER_IP in apps/chat-server/.env above the number of people, and restart it.\n",
      );
    }
    leave(rand(15_000, 40_000));
  });

  socket.on("session", ({ guestId }) => {
    bot.guestId = guestId;
  });

  socket.on("connect", () => {
    socket.emit("room:join", { slug }, (ack) => {
      if (!ack?.ok) {
        refuse(`join: ${ack?.error ?? "no answer"}`);
        return leave(rand(20_000, 60_000));
      }

      bot.inRoom = true;
      stats.joined += 1;
      // Somebody arriving says hello now and then, after a moment of looking around.
      if (chance(0.3))
        wait(rand(3000, 15_000), () => write(pick(SAYINGS.greetings)));
      scheduleMessage();

      if (!options["no-churn"]) {
        // Nobody comes or goes while it is paused either: the room is left as it is.
        const scheduleLeaving = (ms) =>
          wait(ms, () =>
            paused ? scheduleLeaving(5000) : leave(rand(5000, 60_000)),
          );

        scheduleLeaving(rand(10, 60) * 60_000);
      }
    });
  });

  socket.on("message:new", (message) => {
    if (message.guestId === bot.guestId) return;

    if (message.role === "guest" || message.role === "member") {
      recent.push({ nickname: message.nickname });
      if (recent.length > 8) recent.shift();
    }

    // Nobody reacts at once: they read it first.
    if (chance(persona.reacts * Math.min(speed, 3))) {
      wait(
        rand(2000, 15_000),
        () =>
          !paused &&
          socket.emit(
            "reaction:toggle",
            { messageId: message.id, emoji: pickReaction() },
            (ack) => {
              if (ack?.ok) stats.reacted += 1;
              else if (ack?.error !== "rate_limited")
                refuse(`react: ${ack?.error ?? "no answer"}`);
            },
          ),
      );
    }

    // Somebody who is spoken to answers, most of the time.
    if (
      persona.everyS !== Infinity &&
      message.text.includes(`@${profile.nickname}`) &&
      chance(0.75)
    ) {
      wait(rand(5000, 30_000), () =>
        write(`@${message.nickname} ${pick(SAYINGS.replies)}`),
      );
    }
  });

  // A person who has said nothing for a long while is warned; any event counts as being there.
  socket.on("idle:warning", () =>
    socket.emit("dm:unblock", { guestId: "none" }, () => {}),
  );

  socket.on("kicked", (payload) => refuse(`kicked: ${payload?.reason}`));
  socket.on("disconnect", (reason) => {
    if (reason !== "io client disconnect") {
      refuse(`disconnect: ${reason}`);
      leave(rand(10_000, 30_000));
    }
  });
}

// --- Run -------------------------------------------------------------------------------------------------------------

let roomId;
let request;

try {
  ({ id: roomId, request } = await ensureRoom());
  console.log(
    `Room "${options.name}" (${slug}) has room for ${people + 1}; waiting for the chat-server to list it...`,
  );
  await waitForRoom();
} catch (error) {
  console.error(error.message);
  console.error("Are the admin and the chat-server running (npm start)?");
  process.exit(1);
}

console.log(
  `${people} people coming in over ${options.ramp} s at ${url}. Ctrl+C stops them.`,
);

for (let index = 0; index < people; index += 1) {
  later((rampMs * index) / people, startBot);
}

const report = setInterval(() => {
  const inRoom = [...bots].filter((bot) => bot.inRoom).length;
  const refused = [...stats.refused]
    .map(([why, count]) => `${why} x${count}`)
    .join(", ");
  console.log(
    `in the room ${inRoom}/${people}${paused ? " (paused)" : ""}, written ${stats.sent}, reactions ${stats.reacted}, left ${stats.left}${refused ? `; refused: ${refused}` : ""}`,
  );
}, 10_000);

// What crowd:pause, crowd:resume and crowd:stop say, through a file; its being there also says that a crowd is running.
const controlFile = () => {
  try {
    return JSON.parse(fs.readFileSync(CONTROL_FILE, "utf8"));
  } catch {
    return null;
  }
};
fs.writeFileSync(
  CONTROL_FILE,
  JSON.stringify({ pid: process.pid, state: "running", removeRoom: false }),
);

const listen = setInterval(() => {
  const told = controlFile();

  if (!told || told.pid !== process.pid) return;
  if (told.state === "stop")
    void stop(told.removeRoom || options["remove-room"]);
  else paused = told.state === "paused";
}, 1000);

async function stop(removeRoom = options["remove-room"]) {
  if (stopping) return;
  stopping = true;
  clearInterval(report);
  clearInterval(listen);
  bots.forEach((bot) => {
    bot.timers.forEach(clearTimeout);
    bot.socket.disconnect();
  });

  if (removeRoom) {
    try {
      await request(`public-rooms/${roomId}`, { method: "DELETE" });
      console.log(`Room "${slug}" removed.`);
    } catch (error) {
      console.error(`Could not remove the room: ${error.message}`);
    }
  }

  fs.rmSync(CONTROL_FILE, { force: true });
  process.exit(0);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
