// What a guest may react to a message with. A fixed set, so reactions stay emoji and the picker and the server agree;
// the web client keeps the same list (apps/web/src/chat/reactions.ts). The first four are the quick ones.
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

export function isReactionEmoji(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (REACTION_EMOJIS as readonly string[]).includes(value)
  );
}

// Bounds what a message can collect.
export const MAX_REACTION_KINDS = 20;
export const MAX_REACTORS_PER_EMOJI = 200;
