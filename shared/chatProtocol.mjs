export const MAX_MESSAGE_LENGTH = 500;

export const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u;

export const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]{2,24}$/u;

export const PROFILE_UPDATE_EVENT = "profile:update";

export function passwordChecks(password) {
  return {
    length: password.length >= 8 && password.length <= 128,
    lowercase: /\p{Ll}/u.test(password),
    uppercase: /\p{Lu}/u.test(password),
    number: /\p{Nd}/u.test(password),
  };
}
