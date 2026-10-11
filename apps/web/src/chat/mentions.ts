import type { Partner } from "./direct";
import type { Member } from "./types";

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
  const longestFirst = [...people]
    .filter((person) => person.nickname !== "")
    .sort((a, b) => b.nickname.length - a.nickname.length);
  const pieces: MentionPiece[] = [];
  let plain = 0;

  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    if (at > 0 && !/\s/.test(text.charAt(at - 1))) continue;

    const found = longestFirst.find((person) => {
      const end = at + 1 + person.nickname.length;

      return (
        text.slice(at + 1, end).toLowerCase() ===
          person.nickname.toLowerCase() &&
        !/[\p{L}\p{N}]/u.test(text.charAt(end))
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
