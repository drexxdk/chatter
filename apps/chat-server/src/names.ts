import { env } from "./env.js";
import { fetchModerators, type Moderator } from "./payloadClient.js";
import { redis } from "./redis.js";
import { log } from "./log.js";

const CACHE_KEY = "chatter:moderators";

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

// Undefined until the first sync: nobody has checked yet, which is not the same as nobody being a moderator.
export async function getModerators(): Promise<Moderator[] | undefined> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as Moderator[]) : undefined;
}

export async function getModeratorNames(): Promise<string[]> {
  const moderators = (await getModerators()) ?? [];
  return moderators
    .map((moderator) => moderator.name)
    .filter((name): name is string => Boolean(name));
}

// Called when somebody has just proved they are a moderator, so a brand-new account works before the next sync.
// The sync stays the authority: it overwrites the list with what Payload says.
export async function rememberModerator(moderator: Moderator): Promise<void> {
  const moderators = await getModerators();

  // Starting a list from one account would turn every other moderator away until the first sync.
  if (!moderators) return;

  const index = moderators.findIndex((known) => known.id === moderator.id);
  const updated =
    index === -1
      ? [...moderators, moderator]
      : moderators.map((known, i) => (i === index ? moderator : known));

  await redis.set(CACHE_KEY, JSON.stringify(updated));
}

// Called after every sync with the ids of the accounts that may moderate right now, so a removed moderator is
// cut off even though their token has not expired.
export type ModeratorsListener = (accountIds: number[]) => unknown;

async function syncModerators(
  onModerators?: ModeratorsListener,
): Promise<void> {
  const moderators = await fetchModerators();
  await redis.set(CACHE_KEY, JSON.stringify(moderators));

  if (!onModerators) return;

  // The list is already cached, so a failure here is not a failed sync.
  try {
    await onModerators(moderators.map((moderator) => moderator.id));
  } catch (error) {
    log.error("Failed to enforce moderator access", error);
  }
}

// Polls Payload on an interval so handshakes never wait on an upstream HTTP call.
export function startModeratorsSync(
  onModerators?: ModeratorsListener,
): NodeJS.Timeout {
  const sync = () =>
    syncModerators(onModerators).catch((error) =>
      log.error("Failed to sync moderators", error),
    );

  void sync();

  return setInterval(sync, env.SYNC_INTERVAL_MS);
}
