import { env } from "./env.js";
import { log } from "./log.js";
import { withMemberNamesLock } from "./memberNamesLock.js";
import { normalizeName } from "./names.js";
import { fetchUserNames } from "./payloadClient.js";
import { redis } from "./redis.js";

// Private usernames map to their owning account. Public display names are not claims.
// Account writes keep the hash current; sync also picks up admin edits and deletions.
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

export async function cacheMemberNames(
  userId: number,
  nicknames: string[],
  previousNicknames: string[] = [],
): Promise<void> {
  const names = new Set(nicknames.map(normalizeName));

  try {
    for (const name of names) {
      if (!(await claimMemberName(userId, name))) {
        throw new Error(
          "Cached account name ownership differs from the database",
        );
      }
    }

    for (const name of new Set(previousNicknames.map(normalizeName))) {
      if (!names.has(name)) await releaseMemberName(userId, name);
    }
  } catch (error) {
    log.error(
      "Failed to cache account names; rebuilding from the database",
      error,
    );

    try {
      await syncMemberNames();
    } catch (repairError) {
      log.error(
        "Failed to rebuild account names; periodic sync will retry",
        repairError,
      );
    }
  }
}

async function syncMemberNames(
  onMembers?: (accountIds: number[]) => unknown,
): Promise<void> {
  const names = await fetchUserNames();

  if (onMembers) {
    try {
      await onMembers(names.map((name) => name.id));
    } catch (error) {
      log.error("Failed to enforce member access", error);
    }
  }

  const fresh = `${KEY}:fresh`;

  await redis.del(fresh);

  if (names.length === 0) {
    await redis.del(KEY);
    return;
  }

  for (let start = 0; start < names.length; start += 500) {
    const chunk = names
      .slice(start, start + 500)
      .flatMap((name) => [[name.nicknameKey, String(name.id)]])
      .flat();

    await redis.hset(fresh, ...chunk);
  }

  await redis.rename(fresh, KEY);
}

// Polls Payload on an interval, so a guest's handshake never waits on it.
export function startMemberNamesSync(
  onMembers?: (accountIds: number[]) => unknown,
): NodeJS.Timeout {
  let syncing = false;
  const sync = async () => {
    if (syncing) return;
    syncing = true;

    try {
      await withMemberNamesLock(() => syncMemberNames(onMembers));
    } catch (error) {
      log.error("Failed to sync the account nicknames", error);
    } finally {
      syncing = false;
    }
  };

  void sync();

  return setInterval(sync, env.SYNC_INTERVAL_MS * 10);
}
