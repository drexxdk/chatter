import type { Avatar } from "./avatars.js";
import { log } from "./log.js";
import { cacheMemberNames, isMemberName } from "./members.js";
import { withMemberNamesLock } from "./memberNamesLock.js";
import { normalizeName } from "./names.js";
import { isTaken, updateUser } from "./payloadClient.js";

// Keeps a member's profile in their account, and the name in the list of names that are taken. The name here is the
// display name; the username stays what it was and keeps its own claim. Undefined when it worked, otherwise the error
// to answer with.
export async function saveMemberProfile(
  memberId: number,
  username: string,
  oldNickname: string,
  profile: {
    nickname: string;
    avatar: Avatar;
    picture: string | undefined;
    age: number | undefined;
  },
): Promise<string | undefined> {
  return withMemberNamesLock(async () => {
    try {
      if (await isMemberName(profile.nickname, memberId)) {
        return "reserved_nickname";
      }

      await updateUser(memberId, {
        displayName: profile.nickname,
        displayNameKey: normalizeName(profile.nickname),
        ...(profile.picture === undefined ? {} : { picture: profile.picture }),
        avatar: profile.avatar,
        age: profile.age ?? null,
      });
    } catch (error) {
      if (isTaken(error, "displayNameKey")) return "reserved_nickname";

      log.error(
        "Failed to save a profile",
        error instanceof Error ? error.message : "unknown error",
      );
      return "unavailable";
    }

    if (normalizeName(profile.nickname) !== normalizeName(oldNickname)) {
      await cacheMemberNames(
        memberId,
        [username, profile.nickname],
        [oldNickname],
      );
    }

    return undefined;
  });
}
