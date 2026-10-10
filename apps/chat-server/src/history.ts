import { z } from "zod";

import { avatarSchema } from "./avatars.js";
import { env } from "./env.js";
import { redis } from "./redis.js";
import { MAX_REACTION_KINDS, MAX_REACTORS_PER_EMOJI } from "./reactions.js";
import { chatRoleSchema } from "./roles.js";

// Who reacted with an emoji, in the order the emojis were first used.
const reactionsSchema = z
  .array(
    z.object({
      emoji: z.string(),
      users: z.array(z.object({ guestId: z.string(), nickname: z.string() })),
    }),
  )
  .catch([]);

export type Reactions = z.infer<typeof reactionsSchema>;

const messageFields = {
  id: z.string(),
  roomSlug: z.string(),
  sentAt: z.iso.datetime(),
};

// What is kept: the message plus who sent it (a hash of the IP, the same one bans use). Only the server sees the hash.
const storedSchema = z.object({
  ...messageFields,
  guestId: z.string(),
  nickname: z.string(),
  // Messages stored before roles existed were all from guests.
  role: chatRoleSchema.default("guest"),
  avatar: avatarSchema.catch("other"),
  text: z.string(),
  // Absent until somebody reacts.
  reactions: reactionsSchema.optional(),
  ipHash: z.string(),
});

// What is left of a message after its author was banned: no text, no name, nothing to identify them.
const replacedSchema = z.object({ ...messageFields, banned: z.literal(true) });

export type StoredMessage = z.infer<typeof storedSchema>;
export type PublicMessage =
  Omit<StoredMessage, "ipHash"> | z.infer<typeof replacedSchema>;

const historyKey = (slug: string) => `chatter:history:${slug}`;

// One Redis list per room, so every server node sees the same history. It expires after a quiet period.
export async function recordMessage(message: StoredMessage): Promise<void> {
  const key = historyKey(message.roomSlug);

  const results = await redis
    .multi()
    .rpush(key, JSON.stringify(message))
    .ltrim(key, -env.ROOM_HISTORY_SIZE, -1)
    .expire(key, env.ROOM_HISTORY_TTL_SECONDS)
    .exec();

  const failure = results?.find(([error]) => error)?.[0];

  if (failure) throw failure;
  if (!results) throw new Error("Redis discarded the history update");
}

function toPublic(entry: unknown): PublicMessage | undefined {
  const replaced = replacedSchema.safeParse(entry);
  if (replaced.success) return replaced.data;

  const stored = storedSchema.safeParse(entry);
  if (!stored.success) return undefined;

  const { ipHash: _ipHash, ...message } = stored.data;
  return message;
}

export async function getHistory(slug: string): Promise<PublicMessage[]> {
  const entries = await redis.lrange(historyKey(slug), 0, -1);
  const messages: PublicMessage[] = [];

  for (const entry of entries) {
    // A bad entry must not stop a guest from joining, so it is skipped rather than thrown.
    try {
      const message = toPublic(JSON.parse(entry));
      if (message) messages.push(message);
    } catch {
      continue;
    }
  }

  return messages;
}

// Runs inside Redis so it cannot interleave with a message being added: the list is rewritten entry by entry
// (LSET keeps the order and the expiry) and the ids that were replaced are returned.
const REPLACE_SCRIPT = `
local banned = {}
for _, hash in ipairs(ARGV) do banned[hash] = true end
local ids = {}
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
for index, raw in ipairs(entries) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and type(message) == 'table' and type(message.ipHash) == 'string' and banned[message.ipHash] then
    redis.call('LSET', KEYS[1], index - 1, cjson.encode({
      id = message.id, roomSlug = message.roomSlug, sentAt = message.sentAt, banned = true
    }))
    table.insert(ids, message.id)
  end
end
return ids
`;

// Replaces the room's remembered messages from these senders with placeholders; returns the ids it changed.
export async function redactMessagesFrom(
  slug: string,
  ipHashes: string[],
): Promise<string[]> {
  if (ipHashes.length === 0) return [];

  const result = await redis.eval(
    REPLACE_SCRIPT,
    1,
    historyKey(slug),
    ...ipHashes,
  );

  return z.array(z.string()).parse(result);
}

// Adds the guest's reaction to a message, or takes it back if they had made it. Runs inside Redis so it cannot
// interleave with other changes to the list: the entry is rewritten in place (LSET keeps the order and the expiry).
// Returns the message's reactions as JSON, or nothing when the message is not (or no longer) in the list.
const REACT_SCRIPT = `
local maxKinds = tonumber(ARGV[5])
local maxUsers = tonumber(ARGV[6])
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
for index, raw in ipairs(entries) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and type(message) == 'table' and message.id == ARGV[1] then
    if message.banned then return nil end
    if message.guestId == ARGV[3] then return 'own' end
    local reactions = message.reactions
    if type(reactions) ~= 'table' then reactions = {} end
    local found = nil
    for position, reaction in ipairs(reactions) do
      if reaction.emoji == ARGV[2] then found = position end
    end
    if found then
      local users = reactions[found].users
      local kept = {}
      local had = false
      for _, user in ipairs(users) do
        if user.guestId == ARGV[3] then had = true else table.insert(kept, user) end
      end
      if had then
        if #kept == 0 then table.remove(reactions, found) else reactions[found].users = kept end
      else
        if #users >= maxUsers then return 'full' end
        table.insert(users, { guestId = ARGV[3], nickname = ARGV[4] })
      end
    else
      if #reactions >= maxKinds then return 'full' end
      table.insert(reactions, { emoji = ARGV[2], users = { { guestId = ARGV[3], nickname = ARGV[4] } } })
    end
    if #reactions == 0 then
      message.reactions = nil
    else
      message.reactions = reactions
    end
    redis.call('LSET', KEYS[1], index - 1, cjson.encode(message))
    if #reactions == 0 then return '[]' end
    return cjson.encode(reactions)
  end
end
return nil
`;

// The outcome of a reaction: how the message's reactions are now, or why nothing changed.
export type ReactionResult =
  | { ok: true; reactions: Reactions }
  | { ok: false; reason: "not_found" | "full" | "own" };

export async function toggleReaction(
  slug: string,
  messageId: string,
  emoji: string,
  who: { guestId: string; nickname: string },
): Promise<ReactionResult> {
  const result = await redis.eval(
    REACT_SCRIPT,
    1,
    historyKey(slug),
    messageId,
    emoji,
    who.guestId,
    who.nickname,
    String(MAX_REACTION_KINDS),
    String(MAX_REACTORS_PER_EMOJI),
  );

  if (result === null || result === undefined) {
    return { ok: false, reason: "not_found" };
  }

  if (result === "full") return { ok: false, reason: "full" };
  if (result === "own") return { ok: false, reason: "own" };

  // An empty Lua table is encoded as an object, so what is not a list is no reactions.
  const parsed: unknown = JSON.parse(z.string().parse(result));

  return { ok: true, reactions: reactionsSchema.parse(parsed) };
}
