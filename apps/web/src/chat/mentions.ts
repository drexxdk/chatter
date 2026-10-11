import type { Partner } from "./direct";

// The longest nickname the server allows, which bounds how much text after an "@" can still be somebody's name.
const MAX_NAME_LENGTH = 24;
const MAX_SUGGESTIONS = 8;

export interface Mention {
  // Where the "@" is in the text.
  start: number;
  // What has been written after it, up to the cursor.
  query: string;
}

// The "@" the cursor is in the middle of writing a name after, if there is one. It has to begin the text or follow
// whitespace, so an address such as ann@example.com is not taken for a mention.
export function findMention(text: string, caret: number): Mention | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");

  if (start === -1) return null;
  if (start > 0 && !/\s/.test(before.charAt(start - 1))) return null;

  const query = before.slice(start + 1);

  if (query.length > MAX_NAME_LENGTH || /^\s|[\r\n@]/.test(query)) return null;

  return { start, query };
}

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
