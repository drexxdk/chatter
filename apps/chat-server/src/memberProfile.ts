import { parseAge } from "./age.js";
import { avatarSchema, parsePicture, type Avatar } from "./avatars.js";
import { validateNickname } from "./identity.js";
import { log } from "./log.js";
import { cacheMemberNames, isMemberName } from "./members.js";
import { withMemberNamesLock } from "./memberNamesLock.js";
import {
  getModeratorNames,
  isReservedNickname,
  normalizeName,
} from "./names.js";
import { isTaken, updateUser } from "./payloadClient.js";

export type Profile = {
  nickname: string;
  avatar: Avatar;
  picture: string | undefined;
  age: number | undefined;
};

export async function validateProfileUpdate(
  current: Profile,
  payload: unknown,
  memberId?: number,
): Promise<
  | { ok: true; profile: Profile }
  | {
      ok: false;
      error:
        | "invalid_nickname"
        | "reserved_nickname"
        | "invalid_profile"
        | "unavailable";
    }
> {
  const fields: Record<string, unknown> =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const profile = { ...current };

  if ("nickname" in fields) {
    const nickname = validateNickname(fields.nickname);
    if (!nickname) return { ok: false, error: "invalid_nickname" };

    if (nickname !== current.nickname) {
      try {
        if (
          isReservedNickname(nickname, await getModeratorNames()) ||
          (await isMemberName(nickname, memberId))
        ) {
          return { ok: false, error: "reserved_nickname" };
        }
      } catch (error) {
        log.error("Reserved names unavailable", error);
        return { ok: false, error: "unavailable" };
      }
    }

    profile.nickname = nickname;
  }

  if ("avatar" in fields) {
    const avatar = avatarSchema.safeParse(fields.avatar);
    if (!avatar.success) return { ok: false, error: "invalid_profile" };
    profile.avatar = avatar.data;
  }

  if ("picture" in fields) {
    const picture = parsePicture(fields.picture);
    if (!picture) return { ok: false, error: "invalid_profile" };
    profile.picture = picture;
  }

  if ("age" in fields) {
    const age = fields.age === null ? undefined : parseAge(fields.age);
    if (fields.age !== null && age === undefined) {
      return { ok: false, error: "invalid_profile" };
    }
    profile.age = age;
  }

  return { ok: true, profile };
}

// Keeps a member's profile in their account, and the name in the list of names that are taken. The name here is the
// display name; the username stays what it was and keeps its own claim. Undefined when it worked, otherwise the error
// to answer with.
export async function saveMemberProfile(
  memberId: number,
  username: string,
  oldNickname: string,
  profile: Profile,
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
