import { env } from "./env.js";
import { log } from "./log.js";
import { normalizeName } from "./names.js";
import { fetchUserNames } from "./payloadClient.js";
import { redis } from "./redis.js";

// The nicknames of the accounts, which nobody else may take: a hash from the normalized name to the account's id, so a
// guest's handshake is one Redis call and the owner of a name is not mistaken for somebody else. The chat-server is the
// only one that makes or renames accounts, so it keeps the hash up to date itself; the sync only heals it (an account
// removed in the admin, a Redis that was emptied).
const KEY = "chatter:member-names";

// Whether a name belongs to an account other than `exceptUserId`.
export async function isMemberName(
  nickname: string,
  exceptUserId?: number,
): Promise<boolean> {
  const owner = await redis.hget(KEY, normalizeName(nickname));

  return owner !== null && owner !== String(exceptUserId);
}

// Takes the name for the account; false when another account has it.
export async function claimMemberName(
  userId: number,
  nickname: string,
): Promise<boolean> {
  const key = normalizeName(nickname);

  if ((await redis.hsetnx(KEY, key, String(userId))) === 1) return true;

  return (await redis.hget(KEY, key)) === String(userId);
}

export async function releaseMemberName(
  userId: number,
  nickname: string,
): Promise<void> {
  const key = normalizeName(nickname);

  if ((await redis.hget(KEY, key)) === String(userId)) {
    await redis.hdel(KEY, key);
  }
}

async function syncMemberNames(): Promise<void> {
  const names = await fetchUserNames();
  const fresh = `${KEY}:fresh`;

  await redis.del(fresh);

  if (names.length === 0) {
    await redis.del(KEY);
    return;
  }

  for (let start = 0; start < names.length; start += 500) {
    const chunk = names
      .slice(start, start + 500)
      .flatMap((name) => [name.nicknameKey, String(name.id)]);

    await redis.hset(fresh, ...chunk);
  }

  await redis.rename(fresh, KEY);
}

// Polls Payload on an interval, so a guest's handshake never waits on it.
export function startMemberNamesSync(): NodeJS.Timeout {
  const sync = () =>
    syncMemberNames().catch((error) =>
      log.error("Failed to sync the account nicknames", error),
    );

  void sync();

  return setInterval(sync, env.SYNC_INTERVAL_MS * 10);
}
