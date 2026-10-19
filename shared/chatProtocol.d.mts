export const MAX_MESSAGE_LENGTH: 500;
export const NICKNAME_PATTERN: RegExp;
export const USERNAME_PATTERN: RegExp;
export const PROFILE_UPDATE_EVENT: "profile:update";

export type Avatar = "male" | "female" | "trans" | "other";

export interface ProfileChanges {
  nickname?: string;
  avatar?: Avatar;
  picture?: string;
  age?: number | null;
}

export type ProfileUpdateAck =
  | {
      ok: true;
      profile: {
        nickname: string;
        avatar: Avatar;
        picture?: string;
        age?: number;
      };
    }
  | { ok: false; error: string; retryAfterMs?: number };
