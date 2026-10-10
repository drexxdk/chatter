// What the web client mirrors for instant feedback; apps/web/src/serverParity.test.ts fails if the two drift apart.
export const MAX_MESSAGE_LENGTH = 500;

export const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u;
