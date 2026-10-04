import { env } from "./env.js";
import { fetchModeratorNames } from "./payloadClient.js";
import { redis } from "./redis.js";

const CACHE_KEY = "chatter:moderator-names";

// Words that make a name look official. Short ones only count as the whole name, or "Modesty" would be refused.
const AUTHORITY_WORDS = [
  "moderator",
  "administrator",
  "admin",
  "staff",
  "support",
  "system",
];
const AUTHORITY_WHOLE_NAMES = ["mod"];

// Spaces and punctuation are the ways to make one name look like another, so they are dropped before comparing.
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

// Whether a guest may not use this nickname: it is a moderator's name, or it claims to be an authority.
export function isReservedNickname(
  nickname: string,
  moderatorNames: string[],
): boolean {
  const name = normalizeName(nickname);

  return (
    moderatorNames.some((moderator) => normalizeName(moderator) === name) ||
    AUTHORITY_WHOLE_NAMES.includes(name) ||
    AUTHORITY_WORDS.some((word) => name.startsWith(word) || name.endsWith(word))
  );
}

export async function getModeratorNames(): Promise<string[]> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as string[]) : [];
}

async function syncModeratorNames(): Promise<void> {
  await redis.set(CACHE_KEY, JSON.stringify(await fetchModeratorNames()));
}

// Polls Payload on an interval so handshakes never wait on an upstream HTTP call.
export function startModeratorNamesSync(): NodeJS.Timeout {
  const sync = () =>
    syncModeratorNames().catch((error) =>
      console.error("Failed to sync moderator names:", error),
    );

  void sync();

  return setInterval(sync, env.SYNC_INTERVAL_MS);
}
