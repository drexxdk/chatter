import { z } from "zod";

import { env } from "./env.js";
import { redis } from "./redis.js";
import { chatRoleSchema } from "./roles.js";

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
  text: z.string(),
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
