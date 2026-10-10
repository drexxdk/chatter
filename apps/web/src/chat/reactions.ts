import { isRecord } from "../isRecord";

// What a guest can react to a message with: the set the server accepts (apps/chat-server/src/reactions.ts keeps the
// same list). The first four are the quick ones shown when a message is hovered.
export const REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😆",
  "😮",
  "😢",
  "😡",
  "👏",
  "🙏",
  "🔥",
  "🎉",
  "😂",
  "🤣",
  "😊",
  "😍",
  "😘",
  "😎",
  "🤔",
  "😅",
  "😉",
  "🙂",
  "🙃",
  "😴",
  "😭",
  "😱",
  "🤯",
  "🥳",
  "🤝",
  "👌",
  "✌️",
  "🙌",
  "💪",
  "👀",
  "💯",
  "✅",
  "❌",
  "⭐",
  "💡",
  "🚀",
  "🎶",
  "🍕",
  "☕",
  "🍺",
  "🐶",
  "🐱",
  "🌈",
  "☀️",
  "🌙",
  "💔",
] as const;

export const QUICK_REACTIONS = REACTION_EMOJIS.slice(0, 4);

export interface Reaction {
  emoji: string;
  users: { guestId: string; nickname: string }[];
}

// The reactions as the server sends them; anything that does not fit is left out.
export function parseReactions(value: unknown): Reaction[] {
  if (!Array.isArray(value)) return [];

  const reactions: Reaction[] = [];

  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.emoji !== "string" ||
      !Array.isArray(entry.users)
    ) {
      continue;
    }

    const users = entry.users.flatMap((user: unknown) =>
      isRecord(user) &&
      typeof user.guestId === "string" &&
      typeof user.nickname === "string"
        ? [{ guestId: user.guestId, nickname: user.nickname }]
        : [],
    );

    if (users.length > 0) reactions.push({ emoji: entry.emoji, users });
  }

  return reactions;
}

export function sameReactions(
  a: Reaction[] | undefined,
  b: Reaction[] | undefined,
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}
