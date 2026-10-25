import type { UserRecord } from "./payloadClient.js";
import { signToken } from "./tokens.js";

export const MEMBER_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

export function profileOf(user: UserRecord) {
  return {
    nickname: user.displayName,
    username: user.nickname,
    ...(user.picture === undefined ? {} : { picture: user.picture }),
    avatar: user.avatar,
    ...(user.age === undefined ? {} : { age: user.age }),
    ...(user.birthDate === undefined ? {} : { birthDate: user.birthDate }),
  };
}

export function memberSession(
  user: UserRecord,
  secret: string,
  authProvider?: string,
) {
  return {
    token: signToken(
      {
        sub: user.id,
        name: user.nickname,
        role: "member",
        ...(authProvider ? { authProvider } : {}),
      },
      { secret, ttlMs: MEMBER_TOKEN_TTL_MS },
    ),
    provider: authProvider ?? user.provider,
    hasPassword: Boolean(user.passwordHash),
    profile: profileOf(user),
    expiresAt: Date.now() + MEMBER_TOKEN_TTL_MS,
  };
}
