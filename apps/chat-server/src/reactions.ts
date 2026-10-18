import emojiRegex from "emoji-regex";

// Common reaction presets, mirrored by the web client. The first four are the quick ones.
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
    value.length <= 64 &&
    emojiRegex().exec(value)?.[0] === value
  );
}

// Bounds what a message can collect.
export const MAX_REACTION_KINDS = 20;
export const MAX_REACTORS_PER_EMOJI = 200;
