import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Avatar } from "./avatars.js";
import { validateUsername } from "./identity.js";
import { cacheMemberNames, isMemberName } from "./members.js";
import { withMemberNamesLock } from "./memberNamesLock.js";
import { memberSession } from "./memberSession.js";
import {
  getModeratorNames,
  isReservedNickname,
  normalizeName,
} from "./names.js";
import {
  createUser,
  findPasswordUser,
  isTaken,
  updateUser,
} from "./payloadClient.js";
import { hashPassword, passwordSchema, verifyPassword } from "./passwords.js";

export class PasswordAccountError extends Error {}

const claimSchema = z.object({
  username: z.string().max(100),
  password: passwordSchema,
  confirmation: z.string().max(128),
});

export async function claimGuestAccount(
  input: unknown,
  profile: {
    nickname: string;
    avatar: Avatar;
    picture?: string;
    age?: number;
    birthDate?: string;
  },
  secret: string,
) {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) throw new PasswordAccountError("invalid_password");
  if (parsed.data.password !== parsed.data.confirmation) {
    throw new PasswordAccountError("password_mismatch");
  }
  const username = validateUsername(parsed.data.username);
  if (!username) throw new PasswordAccountError("invalid_username");
  const passwordHash = await hashPassword(parsed.data.password);

  return withMemberNamesLock(async () => {
    const moderators = await getModeratorNames();
    for (const [name, field] of [
      [username, "username"],
      [profile.nickname, "nickname"],
    ] as const) {
      if (
        isReservedNickname(name, moderators) ||
        (field === "username" && (await isMemberName(name)))
      ) {
        throw new PasswordAccountError(`reserved_${field}`);
      }
    }
    try {
      const user = await createUser({
        provider: "password",
        providerUserId: randomUUID(),
        passwordHash,
        nickname: username,
        nicknameKey: normalizeName(username),
        displayName: profile.nickname,
        displayNameKey: normalizeName(profile.nickname),
        picture: profile.picture,
        avatar: profile.avatar,
        age: profile.age,
        birthDate: profile.birthDate,
      });
      await cacheMemberNames(user.id, [user.nickname]);
      return memberSession(user, secret);
    } catch (error) {
      if (isTaken(error, "nicknameKey") || isTaken(error, "identity")) {
        throw new PasswordAccountError("reserved_username");
      }
      if (isTaken(error, "displayNameKey"))
        throw new PasswordAccountError("reserved_nickname");
      throw error;
    }
  });
}

export async function signInPassword(input: unknown, secret: string) {
  const parsed = z
    .object({
      username: z.string().max(100),
      password: z.string().min(1).max(128),
    })
    .safeParse(input);
  const username = parsed.success
    ? validateUsername(parsed.data.username)
    : null;
  if (!parsed.success || !username)
    throw new PasswordAccountError("invalid_credentials");
  const user = await findPasswordUser(normalizeName(username));
  const matches = await verifyPassword(
    parsed.data.password,
    user?.provider === "password"
      ? (user.passwordHash ?? undefined)
      : undefined,
  );
  if (!user || !matches) throw new PasswordAccountError("invalid_credentials");
  await withMemberNamesLock(() => cacheMemberNames(user.id, [user.nickname]));
  await updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  return memberSession(user, secret);
}
