import crypto from "crypto";

import type { FakeMember } from "./adminRooms.js";
import { AVATARS, PICTURE_STYLES } from "./avatars.js";
import content from "./crowdContent.json" with { type: "json" };
import { log } from "./log.js";
import { REACTION_EMOJIS } from "./reactions.js";

// People who are not there, but write, answer each other by name and react like a crowd, in a room an admin is testing. The
// same behaviour as `npm run crowd` (scripts/crowd.mjs), which makes real connections instead. Everything is in memory on
// this node and goes when the room's last real person leaves.

export const MAX_CROWD = 200;

// How long the people take to come in, however many there are.
const RAMP_MS = 10_000;
const MIN_GAP_MS = 4000;
const RECENT = 8;

export type CrowdStatus = "stopped" | "running" | "paused";

export interface CrowdState {
  status: CrowdStatus;
  // Who is in the room now, and how many there are meant to be.
  people: number;
  target: number;
}

export interface CrowdMessage {
  id: string;
  guestId: string;
  nickname: string;
  role?: string;
  text: string;
}

export interface CrowdHost {
  // The room's people who are not there, shared with what the admin adds by hand.
  fakes: Map<string, FakeMember[]>;
  // How many more people the room has room for.
  seatsLeft: (slug: string) => Promise<number>;
  say: (slug: string, who: FakeMember, text: string) => Promise<void>;
  react: (
    slug: string,
    who: FakeMember,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  // After they are in the room's list or out of it: say so, and tell the room who is there.
  joined: (slug: string, who: FakeMember) => Promise<void>;
  left: (slug: string, who: FakeMember) => Promise<void>;
  changed: (slug: string, state: CrowdState) => void;
}

// How often each kind of person writes (mean seconds between messages) and how likely they are to react to what they read.
const PERSONAS = [
  { weight: 12, everyS: 30, reacts: 0.012 },
  { weight: 40, everyS: 110, reacts: 0.008 },
  { weight: 28, everyS: 420, reacts: 0.006 },
  { weight: 20, everyS: Infinity, reacts: 0.01 },
];

type Persona = (typeof PERSONAS)[number];

interface Bot {
  who: FakeMember;
  persona: Persona;
  timers: Set<NodeJS.Timeout>;
}

interface Run {
  target: number;
  paused: boolean;
  filling: boolean;
  bots: Map<string, Bot>;
  // The last people to have written, for the others to answer.
  recent: string[];
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const chance = (p: number) => Math.random() < p;
const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(Math.random() * list.length)] as T;

function makeName(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const first = pick(content.firstNames);
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const year = String(Math.floor(rand(70, 99)));
    const name = pick([
      () => `${first}${year}`,
      () => `${first}_${letter.toLowerCase()}`,
      () => `${first} ${letter}.`,
      () => first,
      () => `${first.toLowerCase()}${Math.floor(rand(1, 99))}`,
      () => `${pick(content.words)}${pick(content.things)}`,
      () =>
        `${pick(content.words)}_${pick(content.things)}${Math.floor(rand(1, 9))}`,
    ])();

    if (
      name.length >= 2 &&
      name.length <= 24 &&
      !taken.has(name.toLowerCase())
    ) {
      return name;
    }
  }

  return `guest${Math.floor(rand(1000, 99999))}`;
}

function makeMember(taken: Set<string>): FakeMember {
  const avatar = pick([
    ...Array<(typeof AVATARS)[number]>(8).fill("male"),
    ...Array<(typeof AVATARS)[number]>(8).fill("female"),
    "trans" as const,
    ...Array<(typeof AVATARS)[number]>(3).fill("other"),
  ]);

  return {
    guestId: `fake-${crypto.randomUUID()}`,
    nickname: makeName(taken),
    role: "guest",
    avatar,
    picture: `${pick(PICTURE_STYLES)}:${crypto.randomBytes(5).toString("hex")}`,
    ...(chance(0.65) ? { age: 18 + Math.floor(rand(0, 1) ** 2 * 47) } : {}),
  };
}

function makePersona(): Persona {
  let at = Math.random() * PERSONAS.reduce((sum, p) => sum + p.weight, 0);

  for (const persona of PERSONAS) {
    at -= persona.weight;
    if (at <= 0) return persona;
  }

  return PERSONAS[1] as Persona;
}

function sayAnything(recent: string[]): string {
  const roll = Math.random();
  const { sayings } = content;

  if (recent.length > 0 && roll < 0.32) {
    return `@${pick(recent)} ${pick(sayings.replies)}`;
  }

  if (roll < 0.4) return pick(sayings.greetings);
  if (roll < 0.5) return pick(sayings.questions);
  if (roll < 0.62) return pick(sayings.emoji);
  if (roll < 0.66) return pick(sayings.long);
  if (roll < 0.69) return pick(sayings.multiline);
  return pick(sayings.talk);
}

const pickReaction = () =>
  chance(0.7) ? pick(REACTION_EMOJIS.slice(0, 4)) : pick(REACTION_EMOJIS);

export function createCrowd(
  host: CrowdHost,
  options: { rampMs?: number } = {},
) {
  const rampMs = options.rampMs ?? RAMP_MS;
  const runs = new Map<string, Run>();

  const stateOf = (slug: string): CrowdState => {
    const run = runs.get(slug);

    return run
      ? {
          status: run.paused ? "paused" : "running",
          people: run.bots.size,
          target: run.target,
        }
      : { status: "stopped", people: 0, target: 0 };
  };

  const announce = (slug: string) => host.changed(slug, stateOf(slug));

  // Whether this person is still somebody the crowd runs: not taken away by hand, and the crowd not stopped.
  const alive = (slug: string, run: Run, bot: Bot) =>
    runs.get(slug) === run &&
    run.bots.get(bot.who.guestId) === bot &&
    (host.fakes.get(slug) ?? []).some((who) => who.guestId === bot.who.guestId);

  function later(bot: Bot, ms: number, task: () => void) {
    const timer = setTimeout(() => {
      bot.timers.delete(timer);
      task();
    }, ms);

    timer.unref();
    bot.timers.add(timer);
  }

  const speak = (slug: string, run: Run, bot: Bot, text: string) => {
    if (alive(slug, run, bot) && !run.paused)
      void host.say(slug, bot.who, text);
  };

  function scheduleMessage(slug: string, run: Run, bot: Bot) {
    if (bot.persona.everyS === Infinity) return;

    // Roughly exponential gaps, so there are bursts and silences as in a real room.
    const gap = -Math.log(1 - Math.random()) * bot.persona.everyS * 1000;

    later(bot, Math.max(MIN_GAP_MS, gap), () => {
      if (!alive(slug, run, bot)) return;

      speak(
        slug,
        run,
        bot,
        sayAnything(run.recent.filter((name) => name !== bot.who.nickname)),
      );
      scheduleMessage(slug, run, bot);
    });
  }

  async function addBot(slug: string, run: Run) {
    const taken = new Set(
      (host.fakes.get(slug) ?? []).map((who) => who.nickname.toLowerCase()),
    );
    const bot: Bot = {
      who: makeMember(taken),
      persona: makePersona(),
      timers: new Set(),
    };

    run.bots.set(bot.who.guestId, bot);
    host.fakes.set(slug, [...(host.fakes.get(slug) ?? []), bot.who]);
    scheduleMessage(slug, run, bot);

    // Somebody arriving says hello now and then, after a moment of looking around.
    if (chance(0.3)) {
      later(bot, rand(3000, 15_000), () =>
        speak(slug, run, bot, pick(content.sayings.greetings)),
      );
    }

    announce(slug);
    await host.joined(slug, bot.who);
  }

  function forget(run: Run, guestId: string) {
    run.bots.get(guestId)?.timers.forEach(clearTimeout);
    run.bots.delete(guestId);
  }

  async function removeBot(slug: string, run: Run, bot: Bot) {
    forget(run, bot.who.guestId);
    host.fakes.set(
      slug,
      (host.fakes.get(slug) ?? []).filter(
        (who) => who.guestId !== bot.who.guestId,
      ),
    );
    announce(slug);
    await host.left(slug, bot.who);
  }

  // Brings people in one at a time until there are as many as meant, or the room has no more seats.
  async function fill(slug: string, run: Run) {
    if (run.filling) return;
    run.filling = true;

    try {
      while (runs.get(slug) === run && run.bots.size < run.target) {
        if ((await host.seatsLeft(slug)) <= 0) break;

        await addBot(slug, run);

        if (rampMs > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, Math.max(50, rampMs / run.target)).unref(),
          );
        }
      }
    } finally {
      run.filling = false;
    }
  }

  const fillInBackground = (slug: string, run: Run) =>
    void fill(slug, run).catch((error) =>
      log.error("The crowd could not come in", error),
    );

  async function trim(slug: string, run: Run) {
    while (runs.get(slug) === run && run.bots.size > run.target) {
      const last = [...run.bots.values()].pop() as Bot;

      await removeBot(slug, run, last);
    }
  }

  return {
    state: stateOf,

    // Starts the crowd, or changes how many it should be and carries on if it was paused.
    async start(slug: string, people: number): Promise<string | void> {
      if ((await host.seatsLeft(slug)) <= 0 && !runs.has(slug)) {
        return "room_full";
      }

      const run = runs.get(slug) ?? {
        target: people,
        paused: false,
        filling: false,
        bots: new Map<string, Bot>(),
        recent: [],
      };

      run.target = people;
      run.paused = false;
      runs.set(slug, run);
      announce(slug);
      await trim(slug, run);
      fillInBackground(slug, run);
    },

    // Fewer or more people while it runs.
    async setPeople(slug: string, people: number): Promise<string | void> {
      const run = runs.get(slug);

      if (!run) return "not_running";

      run.target = people;
      announce(slug);
      await trim(slug, run);
      fillInBackground(slug, run);
    },

    // Everybody stays where they are, and says and does nothing.
    pause(slug: string): string | void {
      const run = runs.get(slug);

      if (!run) return "not_running";

      run.paused = true;
      announce(slug);
    },

    resume(slug: string): string | void {
      const run = runs.get(slug);

      if (!run) return "not_running";

      run.paused = false;
      announce(slug);
    },

    // They all leave.
    async stop(slug: string): Promise<void> {
      const run = runs.get(slug);

      if (!run) return;

      runs.delete(slug);

      for (const bot of [...run.bots.values()]) {
        forget(run, bot.who.guestId);
        host.fakes.set(
          slug,
          (host.fakes.get(slug) ?? []).filter(
            (who) => who.guestId !== bot.who.guestId,
          ),
        );
        await host.left(slug, bot.who);
      }

      announce(slug);
    },

    // The room is empty of real people: nobody is left to see it.
    discard(slug: string) {
      const run = runs.get(slug);

      if (!run) return;

      runs.delete(slug);
      run.bots.forEach((bot) => bot.timers.forEach(clearTimeout));
    },

    // Somebody was taken away by hand; they are no longer the crowd's.
    release(slug: string, guestId: string) {
      const run = runs.get(slug);

      if (!run?.bots.has(guestId)) return;

      forget(run, guestId);
      announce(slug);
    },

    // What was just said in the room, by anybody: the people read it, and some answer or react.
    heard(slug: string, message: CrowdMessage) {
      const run = runs.get(slug);

      if (!run) return;

      if (message.role === "guest" || message.role === "member") {
        run.recent.push(message.nickname);
        if (run.recent.length > RECENT) run.recent.shift();
      }

      for (const bot of run.bots.values()) {
        if (message.guestId === bot.who.guestId) continue;

        // Nobody reacts at once: they read it first.
        if (chance(bot.persona.reacts)) {
          later(bot, rand(2000, 15_000), () => {
            if (alive(slug, run, bot) && !run.paused) {
              void host.react(slug, bot.who, message.id, pickReaction());
            }
          });
        }

        // Somebody who is spoken to answers, most of the time.
        if (
          bot.persona.everyS !== Infinity &&
          message.text.includes(`@${bot.who.nickname}`) &&
          chance(0.75)
        ) {
          later(bot, rand(5000, 30_000), () =>
            speak(
              slug,
              run,
              bot,
              `@${message.nickname} ${pick(content.sayings.replies)}`,
            ),
          );
        }
      }
    },
  };
}

export type Crowd = ReturnType<typeof createCrowd>;
