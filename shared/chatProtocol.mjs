export const MAX_MESSAGE_LENGTH = 500;

export const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u;

export const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]{2,24}$/u;

export const PROFILE_UPDATE_EVENT = "profile:update";

export const TYPING_EVENT = "chat:typing";
export const TYPING_TTL_MS = 5000;
export const TYPING_INTERVAL_MS = 1500;

export function ageFromBirthDate(value, today = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return undefined;
  const birthDate = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.toISOString().slice(0, 10) !== value
  )
    return undefined;
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  if (
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate())
  )
    age -= 1;
  return age >= 18 && age <= 99 ? age : undefined;
}

export function passwordChecks(password) {
  return {
    length: password.length >= 8 && password.length <= 128,
    lowercase: /\p{Ll}/u.test(password),
    uppercase: /\p{Lu}/u.test(password),
    number: /\p{Nd}/u.test(password),
  };
}
