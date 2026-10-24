import type { ProfileUpdateAck } from "../../../shared/chatProtocol.mjs";
import type { Avatar } from "./avatars.js";
import { slidingWindow } from "./limits.js";
import { log } from "./log.js";
import {
  saveMemberProfile,
  validateProfileUpdate,
  type ProfileSaveFailure,
} from "./memberProfile.js";
import { fetchUser } from "./payloadClient.js";
import { withProfileLock } from "./profileLock.js";
import type { ChatRole } from "./roles.js";

const PROFILE_CHANGES_PER_WINDOW = 5;
const PROFILE_CHANGE_WINDOW_MS = 60_000;

interface ProfileSocketData {
  nickname: string;
  role: ChatRole;
  avatar: Avatar;
  picture?: string;
  age?: number;
  birthDate?: string;
  memberId?: number;
  username?: string;
  roomSlug?: string;
  profileChangeTimes: number[];
}

export async function handleProfileUpdate(
  payload: unknown,
  reply: (result: ProfileUpdateAck) => void,
  {
    socket,
    data,
    withRoomLock,
    emitPresence,
  }: {
    socket: { id: string; connected: boolean };
    data: ProfileSocketData;
    withRoomLock: (
      slug: string,
      task: () => Promise<ProfileSaveFailure | undefined>,
    ) => Promise<ProfileSaveFailure | undefined>;
    emitPresence: (slug: string) => Promise<void>;
  },
): Promise<void> {
  if (data.role === "moderator") {
    return reply({ ok: false, error: "forbidden" });
  }

  const now = Date.now();
  const profileWait = slidingWindow(
    data.profileChangeTimes,
    now,
    PROFILE_CHANGE_WINDOW_MS,
    PROFILE_CHANGES_PER_WINDOW,
  );
  data.profileChangeTimes = profileWait.recent;

  if (profileWait.waitMs > 0) {
    return reply({
      ok: false,
      error: "rate_limited",
      retryAfterMs: profileWait.waitMs,
    });
  }

  data.profileChangeTimes.push(now);
  let committed = false;
  const key =
    data.memberId === undefined
      ? `socket:${socket.id}`
      : `member:${data.memberId}`;

  try {
    await withProfileLock(key, async () => {
      if (!socket.connected) return;
      const account =
        data.memberId === undefined
          ? undefined
          : await fetchUser(data.memberId);
      if (data.memberId !== undefined && !account) {
        return reply({ ok: false, error: "invalid_token" });
      }

      const result = await validateProfileUpdate(
        {
          nickname: account?.displayName ?? data.nickname,
          avatar: account?.avatar ?? data.avatar,
          picture: account ? account.picture : data.picture,
          age: account ? account.age : data.age,
          birthDate: account ? account.birthDate : data.birthDate,
        },
        payload,
        data.memberId,
      );
      if (!result.ok) return reply({ ok: false, error: result.error });
      const { nickname, avatar, picture, age, birthDate } = result.profile;

      const slug = data.roomSlug;
      const apply = () => {
        data.nickname = nickname;
        data.avatar = avatar;
        data.picture = picture;
        data.age = age;
        data.birthDate = birthDate;
      };
      // The change for good: a member's is kept in their account first, so what the others see is never ahead of it.
      const commit = async (): Promise<ProfileSaveFailure | undefined> => {
        if (data.memberId !== undefined) {
          const failure = await saveMemberProfile(
            data.memberId,
            account?.nickname ?? data.username ?? "",
            account?.displayName ?? data.nickname,
            result.profile,
          );

          if (failure) return failure;
        }

        apply();
        committed = true;
        return undefined;
      };

      const failure = slug ? await withRoomLock(slug, commit) : await commit();
      if (failure)
        return reply(
          typeof failure === "string"
            ? { ok: false, error: failure }
            : { ok: false, ...failure },
        );

      reply({
        ok: true,
        profile: {
          nickname,
          avatar,
          ...(picture === undefined ? {} : { picture }),
          ...(age === undefined ? {} : { age }),
          ...(birthDate === undefined ? {} : { birthDate }),
        },
      });

      if (data.roomSlug) await emitPresence(data.roomSlug);
    });
  } catch (error) {
    log.error("Failed to change the profile", error);
    if (!committed) reply({ ok: false, error: "unavailable" });
  } finally {
    if (!committed) {
      const reservation = data.profileChangeTimes.indexOf(now);
      if (reservation !== -1) data.profileChangeTimes.splice(reservation, 1);
    }
  }
}
