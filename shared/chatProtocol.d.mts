export const MAX_MESSAGE_LENGTH: 500;
export const NICKNAME_PATTERN: RegExp;
export const USERNAME_PATTERN: RegExp;
export const PROFILE_UPDATE_EVENT: "profile:update";
export const TYPING_EVENT: "chat:typing";
export const TYPING_TTL_MS: 5000;
export const TYPING_INTERVAL_MS: 1500;

export interface TypingNotice {
  guestId: string;
  nickname: string;
  active: boolean;
  roomSlug?: string;
  toGuestId?: string;
}

export function ageFromBirthDate(
  value: unknown,
  today?: Date,
): number | undefined;

export function passwordChecks(password: string): {
  length: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
};

export type Avatar = "male" | "female" | "trans" | "other";

export interface ProfileChanges {
  nickname?: string;
  avatar?: Avatar;
  picture?: string;
  age?: number | null;
  birthDate?: string | null;
}

export type ProfileUpdateAck =
  | {
      ok: true;
      profile: {
        nickname: string;
        avatar: Avatar;
        picture?: string;
        age?: number;
        birthDate?: string;
      };
    }
  | { ok: false; error: string; retryAfterMs?: number };
