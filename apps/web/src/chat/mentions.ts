import type { Partner } from "./direct";
import type { Member } from "./types";
import { publicIdentityTag } from "../identity";

export function mentionLabel(person: Partner, _people: Partner[]): string {
  return `${person.nickname}#${publicIdentityTag(person.guestId)}`;
}

// The longest nickname the server allows, which bounds how much text after an "@" can still be somebody's name.
export const MAX_NAME_LENGTH = 24;
const MAX_SUGGESTIONS = 8;

// Who the query could be: the names that begin with it first, then the names that have it somewhere inside. A space
// after the name counts, so a name already written in full does not bring the list back.
export function suggestMentions(people: Partner[], query: string): Partner[] {
  const needle = query.toLowerCase();
  const lower = (person: Partner) => person.nickname.toLowerCase();
  const starts = people.filter((person) => lower(person).startsWith(needle));
  const contains = people.filter(
    (person) =>
      !lower(person).startsWith(needle) && lower(person).includes(needle),
  );

  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

export type MentionPiece = string | { mention: Member; text: string };

// A message's text in pieces: plain words, and the "@" names of people who are in the room. Like when writing one, the
// "@" has to begin the text or follow whitespace; the name is the longest nickname that fits, in any case, and must not
// run on into a longer word.
export function splitMentions(text: string, people: Member[]): MentionPiece[] {
  const owners = new Map<string, Set<string>>();
  for (const person of people) {
    const key = person.nickname.normalize("NFKC").toLowerCase();
    const ids = owners.get(key) ?? new Set<string>();
    ids.add(person.guestId);
    owners.set(key, ids);
  }
  const longestFirst = [...people]
    .filter(
      (person) =>
        person.nickname !== "" &&
        owners.get(person.nickname.normalize("NFKC").toLowerCase())?.size === 1,
    )
    .sort((a, b) => b.nickname.length - a.nickname.length);
  const pieces: MentionPiece[] = [];
  let plain = 0;

  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    if (at > 0 && !/\s/.test(text.charAt(at - 1))) continue;

    const tagged =
      /^([\p{L}\p{N} _.-]{2,24})#([A-Z0-9]+)(?![\p{L}\p{N}])/iu.exec(
        text.slice(at + 1),
      );
    if (tagged?.[2]) {
      const tag = tagged[2].toLowerCase();
      const person = people.find(
        (candidate) =>
          publicIdentityTag(candidate.guestId).toLowerCase() === tag,
      );
      if (person) {
        const end = at + 1 + tagged[0].length;
        if (at > plain) pieces.push(text.slice(plain, at));
        pieces.push({ mention: person, text: text.slice(at, end) });
        plain = end;
        at = end - 1;
      }
      continue;
    }

    const found = longestFirst.find((person) => {
      const end = at + 1 + person.nickname.length;

      return (
        text.slice(at + 1, end).toLowerCase() ===
          person.nickname.toLowerCase() &&
        !/[\p{L}\p{N}#]/u.test(text.charAt(end))
      );
    });

    if (!found) continue;

    const end = at + 1 + found.nickname.length;

    if (at > plain) pieces.push(text.slice(plain, at));
    pieces.push({ mention: found, text: text.slice(at, end) });
    plain = end;
    at = end - 1;
  }

  if (plain < text.length) pieces.push(text.slice(plain));

  return pieces;
}
