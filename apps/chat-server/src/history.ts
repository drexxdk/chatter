import { z } from "zod";

import { env } from "./env.js";
import { redis } from "./redis.js";

const messageSchema = z.object({
  id: z.string(),
  roomSlug: z.string(),
  guestId: z.string(),
  nickname: z.string(),
  text: z.string(),
  sentAt: z.iso.datetime(),
});

export type HistoryMessage = z.infer<typeof messageSchema>;

const historyKey = (slug: string) => `chatter:history:${slug}`;

// One Redis list per room, so every server node sees the same history. It expires after a quiet period.
export async function recordMessage(message: HistoryMessage): Promise<void> {
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

export async function getHistory(slug: string): Promise<HistoryMessage[]> {
  const entries = await redis.lrange(historyKey(slug), 0, -1);
  const messages: HistoryMessage[] = [];

  for (const entry of entries) {
    // A bad entry must not stop a guest from joining, so it is skipped rather than thrown.
    try {
      const parsed = messageSchema.safeParse(JSON.parse(entry));
      if (parsed.success) messages.push(parsed.data);
    } catch {
      continue;
    }
  }

  return messages;
}
