import { describe, expect, it } from "vitest";

import da from "./locales/da.json";
import de from "./locales/de.json";
import en from "./locales/en.json";

function keysOf(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" && child !== null
      ? keysOf(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

// Every error the chat-server can send (see apps/chat-server/README.md) plus the client-only ones.
const ERROR_CODES = [
  "invalid_nickname",
  "banned",
  "unavailable",
  "room_not_found",
  "room_full",
  "not_in_room",
  "invalid_message",
  "rate_limited",
  "rate_limited_wait",
  "inactivity",
  "connection",
  "connection_lost",
  "too_many_connections",
  "reserved_nickname",
  "invalid_token",
  "invalid_credentials",
  "not_a_moderator",
  "no_display_name",
  "moderator_login_disabled",
  "too_many_attempts",
  "invalid_request",
  "announce_wait",
  "forbidden",
  "invalid_profile",
  "invalid_reaction",
  "message_not_found",
  "nickname_taken",
  "user_not_found",
  "invalid_recipient",
  "too_many_blocked",
  "replaced",
  "unknown",
];

describe("locales", () => {
  it.each([
    ["da", da],
    ["de", de],
  ])("%s has exactly the same keys as en", (_code, locale) => {
    expect(keysOf(locale).sort()).toEqual(keysOf(en).sort());
  });

  it.each([
    ["en", en],
    ["da", da],
    ["de", de],
  ])("%s translates every error code", (_code, locale) => {
    for (const code of ERROR_CODES) {
      expect(locale.errors).toHaveProperty(code);
    }
  });

  it.each([
    ["da", da],
    ["de", de],
  ])("%s keeps the same interpolation placeholders as en", (_code, locale) => {
    const placeholders = (text: string) =>
      [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
    const flat = (source: object) =>
      Object.fromEntries(
        keysOf(source).map((key) => [
          key,
          key.split(".").reduce<any>((node, part) => node[part], source),
        ]),
      );
    const translated = flat(locale);

    for (const [key, text] of Object.entries(flat(en))) {
      expect(placeholders(translated[key]), key).toEqual(
        placeholders(text as string),
      );
    }
  });
});
