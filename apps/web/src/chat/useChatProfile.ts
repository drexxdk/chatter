import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { PROFILE_UPDATE_EVENT } from "../../../../shared/chatProtocol.mjs";
import { isRecord } from "../isRecord";
import { normalizeUsername } from "../nickname";
import { ageFromBirthDate, parseAge, type ProfileChanges } from "../profile";
import { parseAvatar, PLAIN_AVATAR, type Avatar } from "./avatar";
import { parsePicture } from "./picture";
import {
  toResult,
  type Ack,
  type ActionResult,
  type ConnectOptions,
  type Session,
} from "./types";

interface ConnectionProfile {
  nickname: string | null;
  avatar: Avatar | null;
  picture: string | null;
  age: number | null;
  birthDate: string | null;
}

export function useChatProfile({
  emitWithAck,
  setSession,
}: {
  emitWithAck: (event: string, payload?: unknown) => Promise<Ack>;
  setSession: Dispatch<SetStateAction<Session | null>>;
}) {
  const profileRef = useRef<ConnectionProfile>({
    nickname: null,
    avatar: null,
    picture: null,
    age: null,
    birthDate: null,
  });

  const getConnectionProfile = useCallback(
    (): Readonly<ConnectionProfile> => profileRef.current,
    [],
  );

  const rememberConnectionProfile = useCallback(
    (nickname: string, options: ConnectOptions) => {
      profileRef.current = {
        nickname,
        avatar: options.avatar ?? null,
        picture: options.picture ?? null,
        age: options.age ?? null,
        birthDate: options.birthDate ?? null,
      };
    },
    [],
  );

  const updateProfile = useCallback(
    async (changes: ProfileChanges): Promise<ActionResult> => {
      const ack = await emitWithAck(PROFILE_UPDATE_EVENT, changes);
      if (!ack.ok) return toResult(ack);

      const profile = isRecord(ack.profile) ? ack.profile : {};
      const username =
        typeof profile.username === "string"
          ? normalizeUsername(profile.username)
          : null;
      const nickname =
        typeof profile.nickname === "string" && profile.nickname
          ? profile.nickname
          : (profileRef.current.nickname ?? "");
      const avatar = parseAvatar(profile.avatar);
      const picture = parsePicture(profile.picture);
      const age = parseAge(profile.age);
      const birthDate =
        ageFromBirthDate(profile.birthDate) === undefined
          ? undefined
          : (profile.birthDate as string);

      profileRef.current = {
        nickname,
        picture: picture ?? null,
        avatar: avatar === PLAIN_AVATAR ? null : avatar,
        age: age ?? null,
        birthDate: birthDate ?? null,
      };
      setSession((current) =>
        current
          ? {
              ...current,
              ...(username ? { username } : {}),
              nickname,
              avatar,
              picture,
              age,
              birthDate,
            }
          : current,
      );
      return { ok: true };
    },
    [emitWithAck, setSession],
  );

  return { getConnectionProfile, rememberConnectionProfile, updateProfile };
}
