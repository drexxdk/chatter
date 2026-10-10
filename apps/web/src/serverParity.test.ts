import { describe, expect, it } from "vitest";

import {
  MAX_AGE as SERVER_MAX_AGE,
  MIN_AGE as SERVER_MIN_AGE,
} from "../../chat-server/src/age";
import { AVATARS as SERVER_AVATARS } from "../../chat-server/src/avatars";
import {
  MAX_MESSAGE_LENGTH as SERVER_MAX_MESSAGE_LENGTH,
  NICKNAME_PATTERN as SERVER_NICKNAME_PATTERN,
} from "../../chat-server/src/limits";
import { REACTION_EMOJIS as SERVER_REACTION_EMOJIS } from "../../chat-server/src/reactions";
import { AVATARS } from "./chat/avatar";
import { MAX_MESSAGE_LENGTH } from "./chat/limits";
import { REACTION_EMOJIS } from "./chat/reactions";
import { NICKNAME_PATTERN } from "./nickname";
import { MAX_AGE, MIN_AGE } from "./profile";

// What the client repeats from the server so as to answer before a round trip. The server decides; these only keep
// the client from offering what the server would refuse.
describe("what the client mirrors from the chat-server", () => {
  it("allows the same message length", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(SERVER_MAX_MESSAGE_LENGTH);
  });

  it("allows the same nicknames", () => {
    expect(NICKNAME_PATTERN.source).toBe(SERVER_NICKNAME_PATTERN.source);
    expect(NICKNAME_PATTERN.flags).toBe(SERVER_NICKNAME_PATTERN.flags);
  });

  it("allows the same ages", () => {
    expect([MIN_AGE, MAX_AGE]).toEqual([SERVER_MIN_AGE, SERVER_MAX_AGE]);
  });

  it("offers the same avatars", () => {
    expect([...AVATARS]).toEqual([...SERVER_AVATARS]);
  });

  it("offers the same reactions, in the same order", () => {
    expect([...REACTION_EMOJIS]).toEqual([...SERVER_REACTION_EMOJIS]);
  });
});
