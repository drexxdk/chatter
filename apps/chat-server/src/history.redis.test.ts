import { Redis } from "ioredis";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// These run the history's Lua scripts against a real Redis, which the other tests only mock. They are skipped unless
// TEST_REDIS_URL names one (CI has a service container; locally, e.g. redis://localhost:6379/9 on the one from
// docker-compose). Every test uses a room of its own and removes it again.
const URL = process.env.TEST_REDIS_URL;

const client = vi.hoisted(() => ({ current: undefined as Redis | undefined }));

vi.mock("./redis.js", async () => {
  const { Redis } = await import("ioredis");
  client.current = new Redis(
    process.env.TEST_REDIS_URL ?? "redis://localhost",
    {
      lazyConnect: true,
    },
  );

  return { redis: client.current };
});

const { getHistory, recordMessage, redactMessagesFrom, toggleReaction } =
  await import("./history.js");
const { MAX_REACTION_KINDS, MAX_REACTORS_PER_EMOJI } =
  await import("./reactions.js");

const redis = () => client.current!;

const reactionsOf = (
  message: Awaited<ReturnType<typeof getHistory>>[number],
) => ("reactions" in message ? message.reactions : undefined);

describe.skipIf(!URL)("history against a real Redis", () => {
  let slug = "";
  const keyOf = () => `chatter:history:${slug}`;
  let n = 0;

  const message = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    roomSlug: slug,
    guestId: `guest-${id}`,
    nickname: `Nick ${id}`,
    role: "guest" as const,
    avatar: "other" as const,
    text: `hello ${id}`,
    sentAt: new Date(Date.UTC(2026, 9, 3, 12, 0, ++n % 60)).toISOString(),
    ipHash: `hash-${id}`,
    ...extra,
  });

  const who = (name: string) => ({ guestId: `g-${name}`, nickname: name });

  beforeEach(async () => {
    await redis()
      .connect()
      .catch(() => undefined);
    slug = `it-${Math.random().toString(36).slice(2)}`;
  });

  afterEach(async () => {
    await redis().del(keyOf());
  });

  afterAll(() => redis().disconnect());

  describe("recording and reading", () => {
    it("keeps the messages in order, with an expiry, and no more than the history's size", async () => {
      for (let i = 0; i < 55; i++) await recordMessage(message(`m${i}`));

      const history = await getHistory(slug);

      expect(history).toHaveLength(50);
      expect(history[0].id).toBe("m5");
      expect(history.at(-1)?.id).toBe("m54");
      expect(await redis().ttl(keyOf())).toBeGreaterThan(0);
    });

    it("never hands out the sender's IP hash", async () => {
      await recordMessage(message("a"));

      expect(JSON.stringify(await getHistory(slug))).not.toContain("hash-a");
    });
  });

  describe("reacting", () => {
    it("adds a reaction, then takes it back, and drops what nobody has", async () => {
      await recordMessage(message("a"));

      expect(await toggleReaction(slug, "a", "👍", who("Bob"))).toEqual({
        ok: true,
        reactions: [{ emoji: "👍", users: [who("Bob")] }],
      });
      expect(await toggleReaction(slug, "a", "👍", who("Carol"))).toEqual({
        ok: true,
        reactions: [{ emoji: "👍", users: [who("Bob"), who("Carol")] }],
      });
      await toggleReaction(slug, "a", "❤️", who("Bob"));

      const before = (await getHistory(slug))[0];
      expect(before).toMatchObject({
        reactions: [
          { emoji: "👍", users: [who("Bob"), who("Carol")] },
          { emoji: "❤️", users: [who("Bob")] },
        ],
      });

      await toggleReaction(slug, "a", "👍", who("Bob"));
      await toggleReaction(slug, "a", "👍", who("Carol"));
      await toggleReaction(slug, "a", "❤️", who("Bob"));

      const after = (await getHistory(slug))[0];
      expect(reactionsOf(after)).toBeUndefined();
      expect(await toggleReaction(slug, "a", "🔥", who("Bob"))).toEqual({
        ok: true,
        reactions: [{ emoji: "🔥", users: [who("Bob")] }],
      });
    });

    it("keeps the order the emoji were first used in", async () => {
      await recordMessage(message("a"));

      for (const emoji of ["😆", "👍", "🔥"]) {
        await toggleReaction(slug, "a", emoji, who("Bob"));
      }
      await toggleReaction(slug, "a", "👍", who("Carol"));

      const result = await toggleReaction(slug, "a", "😮", who("Bob"));

      expect(result.ok && result.reactions.map((r) => r.emoji)).toEqual([
        "😆",
        "👍",
        "🔥",
        "😮",
      ]);
    });

    it("leaves the rest of the message, the other messages and their order, and the expiry alone", async () => {
      await recordMessage(
        message("a", {
          nickname: 'Ångström "q" / 😆',
          text: "héllo\nwörld ✓ 👍",
        }),
      );
      await recordMessage(message("b"));
      await recordMessage(message("c"));
      const ttl = await redis().ttl(keyOf());

      await toggleReaction(slug, "b", "👍", who("Bob"));

      const history = await getHistory(slug);
      expect(history.map((m) => m.id)).toEqual(["a", "b", "c"]);
      expect(history[0]).toMatchObject({
        nickname: 'Ångström "q" / 😆',
        text: "héllo\nwörld ✓ 👍",
        role: "guest",
        avatar: "other",
      });
      const raw = JSON.parse((await redis().lrange(keyOf(), 1, 1))[0]);
      expect(raw.ipHash).toBe("hash-b");
      expect(await redis().ttl(keyOf())).toBeGreaterThan(ttl - 5);
    });

    it("refuses what is not there, or not a message any more", async () => {
      await recordMessage(message("a"));
      await redactMessagesFrom(slug, ["hash-a"]);

      expect(await toggleReaction(slug, "missing", "👍", who("Bob"))).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(await toggleReaction(slug, "a", "👍", who("Bob"))).toEqual({
        ok: false,
        reason: "not_found",
      });
    });

    it("refuses a guest's reaction to their own message", async () => {
      await recordMessage(message("a", { guestId: "g-Bob" }));

      expect(await toggleReaction(slug, "a", "👍", who("Bob"))).toEqual({
        ok: false,
        reason: "own",
      });
      expect(reactionsOf((await getHistory(slug))[0])).toBeUndefined();
    });

    it("stops at the most emoji a message may have, but lets one of them be taken back", async () => {
      await recordMessage(message("a"));
      const emojis = Array.from(
        { length: MAX_REACTION_KINDS },
        (_, i) => `e${i}`,
      );

      for (const emoji of emojis) {
        expect((await toggleReaction(slug, "a", emoji, who("Bob"))).ok).toBe(
          true,
        );
      }

      expect(
        await toggleReaction(slug, "a", "one-too-many", who("Bob")),
      ).toEqual({
        ok: false,
        reason: "full",
      });
      expect((await toggleReaction(slug, "a", "e0", who("Bob"))).ok).toBe(true);
    });

    it("stops at the most reactors an emoji may have", async () => {
      await recordMessage(message("a"));

      for (let i = 0; i < MAX_REACTORS_PER_EMOJI; i++) {
        await toggleReaction(slug, "a", "👍", who(`u${i}`));
      }

      expect(await toggleReaction(slug, "a", "👍", who("late"))).toEqual({
        ok: false,
        reason: "full",
      });
    });

    it("does not lose a reaction when many arrive at once", async () => {
      await recordMessage(message("a"));

      await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          toggleReaction(slug, "a", "👍", who(`u${i}`)),
        ),
      );

      const reactions = reactionsOf((await getHistory(slug))[0]);
      expect(reactions?.[0].users).toHaveLength(40);
    });
  });

  describe("replacing a banned guest's messages", () => {
    it("replaces exactly their messages with placeholders, reactions included, and says which", async () => {
      await recordMessage(message("a", { ipHash: "bad" }));
      await recordMessage(message("b", { ipHash: "good" }));
      await recordMessage(message("c", { ipHash: "bad" }));
      await toggleReaction(slug, "a", "👍", who("Bob"));

      const ids = await redactMessagesFrom(slug, ["bad"]);

      expect(ids.sort()).toEqual(["a", "c"]);
      const history = await getHistory(slug);
      expect(history.map((m) => m.id)).toEqual(["a", "b", "c"]);
      expect(history[0]).toEqual({
        id: "a",
        roomSlug: slug,
        sentAt: expect.any(String),
        banned: true,
      });
      expect(history[1]).toMatchObject({ id: "b", text: "hello b" });
      expect(history[2]).toMatchObject({ banned: true });
    });

    it("leaves messages that were stored without a sender hash alone", async () => {
      await recordMessage(message("a", { ipHash: "" }));

      expect(await redactMessagesFrom(slug, ["bad"])).toEqual([]);
      expect((await getHistory(slug))[0]).toMatchObject({ text: "hello a" });
    });

    it("does nothing for a room with no history", async () => {
      expect(await redactMessagesFrom(slug, ["bad"])).toEqual([]);
    });
  });
});
