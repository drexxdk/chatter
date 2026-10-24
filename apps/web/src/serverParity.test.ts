import { describe, expect, expectTypeOf, it } from "vitest";
import {
  PROFILE_UPDATE_EVENT,
  type Avatar as SharedAvatar,
  type ProfileChanges as SharedProfileChanges,
} from "../../../shared/chatProtocol.mjs";

import {
  MAX_AGE as SERVER_MAX_AGE,
  MIN_AGE as SERVER_MIN_AGE,
} from "../../chat-server/src/age";
import {
  AVATARS as SERVER_AVATARS,
  PICTURE_PATTERN as SERVER_PICTURE_PATTERN,
  PICTURE_STYLES as SERVER_PICTURE_STYLES,
  type Avatar as ServerAvatar,
} from "../../chat-server/src/avatars";
import {
  MAX_MESSAGE_LENGTH as SERVER_MAX_MESSAGE_LENGTH,
  NICKNAME_PATTERN as SERVER_NICKNAME_PATTERN,
  USERNAME_PATTERN as SERVER_USERNAME_PATTERN,
} from "../../chat-server/src/limits";
import { REACTION_EMOJIS as SERVER_REACTION_EMOJIS } from "../../chat-server/src/reactions";
import { AVATARS, type Avatar } from "./chat/avatar";
import { MAX_MESSAGE_LENGTH } from "./chat/limits";
import { PICTURE_PATTERN, PICTURE_STYLES } from "./chat/picture";
import { REACTION_EMOJIS } from "./chat/reactions";
import { NICKNAME_PATTERN, USERNAME_PATTERN } from "./nickname";
import { MAX_AGE, MIN_AGE, type ProfileChanges } from "./profile";

// What the client repeats from the server so as to answer before a round trip. The server decides; these only keep
// the client from offering what the server would refuse.
describe("what the client mirrors from the chat-server", () => {
  it("allows the same message length", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(SERVER_MAX_MESSAGE_LENGTH);
    expect(MAX_MESSAGE_LENGTH).toBe(500);
  });

  it("allows the same nicknames", () => {
    expect(NICKNAME_PATTERN.source).toBe(SERVER_NICKNAME_PATTERN.source);
    expect(NICKNAME_PATTERN.flags).toBe(SERVER_NICKNAME_PATTERN.flags);
  });

  it("allows the same usernames", () => {
    expect(USERNAME_PATTERN.source).toBe(SERVER_USERNAME_PATTERN.source);
    expect(USERNAME_PATTERN.flags).toBe(SERVER_USERNAME_PATTERN.flags);
  });

  it("offers the same picture styles, and checks a picture the same way", () => {
    expect([...PICTURE_STYLES]).toEqual([...SERVER_PICTURE_STYLES]);
    expect(PICTURE_PATTERN.source).toBe(SERVER_PICTURE_PATTERN.source);
  });

  it("allows the same ages", () => {
    expect([MIN_AGE, MAX_AGE]).toEqual([SERVER_MIN_AGE, SERVER_MAX_AGE]);
  });

  it("offers the same avatars", () => {
    expect([...AVATARS]).toEqual([...SERVER_AVATARS]);
    expectTypeOf<ServerAvatar>().toEqualTypeOf<SharedAvatar>();
    expectTypeOf<(typeof AVATARS)[number]>().toEqualTypeOf<SharedAvatar>();
    expectTypeOf<Avatar>().toEqualTypeOf<SharedAvatar>();
  });

  it("offers the same reactions, in the same order", () => {
    expect([...REACTION_EMOJIS]).toEqual([...SERVER_REACTION_EMOJIS]);
  });

  it("keeps the profile-update event and partial payload contract stable", () => {
    expect(PROFILE_UPDATE_EVENT).toBe("profile:update");
    expectTypeOf<ProfileChanges>().toEqualTypeOf<SharedProfileChanges>();
    expectTypeOf<ProfileChanges>().toEqualTypeOf<{
      username?: string;
      nickname?: string;
      avatar?: SharedAvatar;
      picture?: string;
      age?: number | null;
      birthDate?: string | null;
    }>();
  });
});
