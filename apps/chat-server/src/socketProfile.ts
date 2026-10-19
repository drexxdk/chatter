import type { ProfileUpdateAck } from "../../../shared/chatProtocol.mjs";
import type { Avatar } from "./avatars.js";
import { slidingWindow } from "./limits.js";
import { log } from "./log.js";
import { saveMemberProfile, validateProfileUpdate } from "./memberProfile.js";
import { normalizeName } from "./names.js";
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
    nameInUse,
    emitPresence,
  }: {
    socket: { id: string; connected: boolean };
    data: ProfileSocketData;
    withRoomLock: (
      slug: string,
      task: () => Promise<string | undefined>,
    ) => Promise<string | undefined>;
    nameInUse: (slug: string, nickname: string) => Promise<boolean>;
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
        },
        payload,
        data.memberId,
      );
      if (!result.ok) return reply({ ok: false, error: result.error });
      const { nickname, avatar, picture, age } = result.profile;

      const slug = data.roomSlug;
      const apply = () => {
        data.nickname = nickname;
        data.avatar = avatar;
        data.picture = picture;
        data.age = age;
      };
      // The change for good: a member's is kept in their account first, so what the others see is never ahead of it.
      const commit = async (): Promise<string | undefined> => {
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

      // A new name must not be one somebody else in the room has; checked and taken under the room's lock, so two
      // people choosing the same name at once cannot both get it.
      if (slug && normalizeName(nickname) !== normalizeName(data.nickname)) {
        const failure = await withRoomLock(slug, async () =>
          (await nameInUse(slug, nickname)) ? "nickname_taken" : commit(),
        );

        if (failure) return reply({ ok: false, error: failure });
      } else {
        const failure = await commit();

        if (failure) return reply({ ok: false, error: failure });
      }

      reply({
        ok: true,
        profile: {
          nickname,
          avatar,
          ...(picture === undefined ? {} : { picture }),
          ...(age === undefined ? {} : { age }),
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
