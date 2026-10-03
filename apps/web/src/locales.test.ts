import { describe, expect, it } from "vitest";

import da from "./locales/da.json";
import de from "./locales/de.json";
import en from "./locales/en.json";

function keysOf(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" && child !== null ? keysOf(child, `${prefix}${key}.`) : [`${prefix}${key}`],
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
  "inactivity",
  "connection",
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
    const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
    const flat = (source: object) => Object.fromEntries(keysOf(source).map((key) => [key, key.split(".").reduce<any>((node, part) => node[part], source)]));
    const translated = flat(locale);

    for (const [key, text] of Object.entries(flat(en))) {
      expect(placeholders(translated[key]), key).toEqual(placeholders(text as string));
    }
  });
});
