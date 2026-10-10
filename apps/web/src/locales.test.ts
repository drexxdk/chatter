import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import i18n from "./i18n";
import da from "./locales/da.json";
import de from "./locales/de.json";
import en from "./locales/en.json";

// The values a message takes, wherever they are used in it, plurals and selects included.
function argumentsOf(elements: MessageFormatElement[]): string[] {
  return elements.flatMap((element) => {
    switch (element.type) {
      case TYPE.literal:
      case TYPE.pound:
        return [];
      case TYPE.plural:
      case TYPE.select:
        return [
          element.value,
          ...Object.values(element.options).flatMap((option) =>
            argumentsOf(option.value),
          ),
        ];
      case TYPE.tag:
        return argumentsOf(element.children);
      default:
        return [element.value];
    }
  });
}

const argumentsIn = (text: string) =>
  [...new Set(argumentsOf(parse(text)))].sort();

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
    ["en", en],
    ["da", da],
    ["de", de],
  ])(
    "%s has only messages that are valid ICU MessageFormat",
    (_code, locale) => {
      for (const key of keysOf(locale)) {
        const text = key
          .split(".")
          .reduce<any>((node, part) => node[part], locale) as string;

        expect(() => parse(text), key).not.toThrow();
      }
    },
  );

  it.each([
    ["da", da],
    ["de", de],
  ])("%s takes the same values as en in every message", (_code, locale) => {
    const flat = (source: object) =>
      Object.fromEntries(
        keysOf(source).map((key) => [
          key,
          key.split(".").reduce<any>((node, part) => node[part], source),
        ]),
      );
    const translated = flat(locale);

    for (const [key, text] of Object.entries(flat(en))) {
      expect(argumentsIn(translated[key]), key).toEqual(
        argumentsIn(text as string),
      );
    }
  });

  it.each([
    ["en", "minutesAgo", 1, "1 minute ago"],
    ["en", "minutesAgo", 2, "2 minutes ago"],
    ["da", "minutesAgo", 1, "for 1 minut siden"],
    ["da", "minutesAgo", 5, "for 5 minutter siden"],
    ["de", "minutesAgo", 1, "vor 1 Minute"],
    ["de", "minutesAgo", 5, "vor 5 Minuten"],
  ])(
    "%s says %s with %i in the right form: %s",
    (code, key, count, expected) => {
      expect(i18n.getFixedT(code)(`time.${key}`, { count })).toBe(expected);
    },
  );
});
