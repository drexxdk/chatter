import { ageFromBirthDate, parseAge } from "./age.js";
import { avatarSchema, parsePicture, type Avatar } from "./avatars.js";
import { validateNickname, validateUsername } from "./identity.js";
import { log } from "./log.js";
import { cacheMemberNames, isMemberName } from "./members.js";
import { withMemberNamesLock } from "./memberNamesLock.js";
import {
  getModeratorNames,
  isReservedNickname,
  normalizeName,
} from "./names.js";
import { fetchUser, isTaken, updateUser } from "./payloadClient.js";

const DISPLAY_NAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export type ProfileSaveFailure =
  string | { error: "display_name_cooldown"; retryAfterMs: number };

export type Profile = {
  username?: string;
  nickname: string;
  avatar: Avatar;
  picture: string | undefined;
  age: number | undefined;
  birthDate?: string;
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
        | "invalid_username"
        | "forbidden"
        | "unavailable";
    }
> {
  const fields: Record<string, unknown> =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const profile = { ...current };

  if ("username" in fields) {
    if (memberId === undefined) return { ok: false, error: "forbidden" };
    const username = validateUsername(fields.username);
    if (!username) return { ok: false, error: "invalid_username" };
    profile.username = username;
  }

  if ("nickname" in fields) {
    const nickname = validateNickname(fields.nickname);
    if (!nickname) return { ok: false, error: "invalid_nickname" };

    if (nickname !== current.nickname) {
      try {
        if (isReservedNickname(nickname, await getModeratorNames())) {
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

  if ("birthDate" in fields) {
    const age = ageFromBirthDate(fields.birthDate);
    if (fields.birthDate !== null && age === undefined)
      return { ok: false, error: "invalid_profile" };
    profile.birthDate =
      fields.birthDate === null ? undefined : (fields.birthDate as string);
    profile.age = age;
  } else if ("age" in fields) {
    if (current.birthDate) return { ok: false, error: "invalid_profile" };
    const age = fields.age === null ? undefined : parseAge(fields.age);
    if (fields.age !== null && age === undefined) {
      return { ok: false, error: "invalid_profile" };
    }
    profile.age = age;
  }

  return { ok: true, profile };
}

// Persists the profile and rename deadline under the account write lock; only the private username stays claimed.
export async function saveMemberProfile(
  memberId: number,
  username: string,
  oldNickname: string,
  profile: Profile,
): Promise<ProfileSaveFailure | undefined> {
  return withMemberNamesLock(async () => {
    let previousUsername = username;
    let nextUsername = username;
    try {
      const current = await fetchUser(memberId);
      if (!current) return "invalid_token";
      previousUsername = current.nickname;
      nextUsername = profile.username ?? previousUsername;
      if (nextUsername !== previousUsername) {
        if (
          isReservedNickname(nextUsername, await getModeratorNames()) ||
          (await isMemberName(nextUsername, memberId))
        )
          return "reserved_username";
      }
      const renamed = profile.nickname !== current.displayName;
      const now = Date.now();
      const previousChange = current.displayNameChangedAt
        ? Date.parse(current.displayNameChangedAt)
        : 0;
      const remaining = previousChange + DISPLAY_NAME_COOLDOWN_MS - now;
      if (renamed && previousChange && remaining > 0) {
        return { error: "display_name_cooldown", retryAfterMs: remaining };
      }
      await updateUser(memberId, {
        ...(nextUsername === previousUsername
          ? {}
          : {
              nickname: nextUsername,
              nicknameKey: normalizeName(nextUsername),
            }),
        displayName: profile.nickname,
        ...(renamed
          ? { displayNameChangedAt: new Date(now).toISOString() }
          : {}),
        displayNameKey: normalizeName(profile.nickname),
        ...(profile.picture === undefined ? {} : { picture: profile.picture }),
        avatar: profile.avatar,
        age: profile.age ?? null,
        birthDate: profile.birthDate ?? null,
      });
    } catch (error) {
      if (isTaken(error, "nicknameKey")) return "reserved_username";
      log.error(
        "Failed to save a profile",
        error instanceof Error ? error.message : "unknown error",
      );
      return "unavailable";
    }

    if (
      normalizeName(nextUsername) !== normalizeName(previousUsername) ||
      normalizeName(profile.nickname) !== normalizeName(oldNickname)
    ) {
      await cacheMemberNames(
        memberId,
        [nextUsername],
        [previousUsername, oldNickname],
      );
    }

    return undefined;
  });
}
