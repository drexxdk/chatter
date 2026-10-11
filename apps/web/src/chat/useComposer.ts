import { useLayoutEffect, useRef, useState } from "react";

import { MAX_MESSAGE_LENGTH } from "./limits";

// A person chosen from the list of suggestions while writing: where their name is in the text. The text has the name
// without the "@", which is put back when the message is sent.
export interface DraftMention {
  start: number;
  end: number;
}

// The mentions of the text as it was, moved to where they are in the text as it is. Anything the edit touched is no
// longer a mention, and is left as the words it is.
export function shiftMentions(
  mentions: DraftMention[],
  before: string,
  after: string,
): DraftMention[] {
  if (before === after || mentions.length === 0) return mentions;

  const limit = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < limit && before[prefix] === after[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < limit - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }

  const changedEnd = before.length - suffix;
  const delta = after.length - before.length;

  return mentions.flatMap((mention) =>
    mention.end <= prefix
      ? [mention]
      : mention.start >= changedEnd
        ? [{ start: mention.start + delta, end: mention.end + delta }]
        : [],
  );
}

// The words as they are sent: each mention has its "@" back.
function withAts(text: string, mentions: DraftMention[]): string {
  let sent = "";
  let at = 0;

  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    sent += `${text.slice(at, mention.start)}@`;
    at = mention.start;
  }

  return sent + text.slice(at);
}

// What a guest is writing: the words, the people they have mentioned, and a GIF they have added. All go out as one
// message, the GIF as its last line. Emoji are put in at the cursor of the box named by `boxId`.
export function useComposer(boxId: string) {
  const [draft, setDraft] = useState({
    text: "",
    mentions: [] as DraftMention[],
  });
  const { text, mentions } = draft;
  const [gif, setGifState] = useState<string | null>(null);
  const caret = useRef<number | null>(null);
  // Where the cursor goes when the box is focused again: focusing a box resets it to the start.
  const resume = useRef<number | null>(null);
  // The GIF's address and the line break before it count towards the message's length, and so does the "@" that each
  // mention gets when it is sent.
  const reserve = (gif ? gif.length + 1 : 0) + mentions.length;
  const max = MAX_MESSAGE_LENGTH - reserve;

  // Moves the cursor to where the emoji ended, once the box shows the new text.
  useLayoutEffect(() => {
    if (caret.current === null) return;

    const box = document.getElementById(boxId) as HTMLTextAreaElement | null;
    box?.setSelectionRange(caret.current, caret.current);
    resume.current = caret.current;
    caret.current = null;
  }, [text, boxId]);

  function setText(next: string) {
    setDraft((current) =>
      current.text === next
        ? current
        : {
            text: next,
            mentions: shiftMentions(current.mentions, current.text, next),
          },
    );
  }

  // Puts `added` in place of what is between `start` and `end`, with the cursor after it. When `mentioned` is given, it is
  // the name that `added` begins with, which becomes a mention.
  function replaceRange(
    start: number,
    end: number,
    added: string,
    mentioned?: string,
  ) {
    const next = text.slice(0, start) + added + text.slice(end);

    if (next.length > max - (mentioned ? 1 : 0)) return;

    caret.current = start + added.length;
    setDraft((current) => ({
      text: next,
      mentions: [
        ...shiftMentions(current.mentions, current.text, next),
        ...(mentioned ? [{ start, end: start + mentioned.length }] : []),
      ],
    }));
  }

  function addEmoji(emoji: string) {
    const box = document.getElementById(boxId) as HTMLTextAreaElement | null;
    const start = Math.min(box?.selectionStart ?? text.length, text.length);
    const end = Math.min(box?.selectionEnd ?? start, text.length);

    replaceRange(start, end, emoji);
  }

  // The name of somebody chosen from the list, in place of the "@" and what was written after it, and a space after.
  function addMention(start: number, end: number, nickname: string) {
    replaceRange(start, end, `${nickname} `, nickname);
  }

  function setGif(url: string | null) {
    setGifState(url);
    resume.current = null;
    // Room for the picture is made by cutting the words short rather than by refusing it.
    if (url) {
      setDraft((current) => {
        const cut = current.text.slice(
          0,
          MAX_MESSAGE_LENGTH - url.length - 1 - current.mentions.length,
        );

        return {
          text: cut,
          mentions: shiftMentions(current.mentions, current.text, cut),
        };
      });
    }
  }

  // Back in the box after the picker closed, with the cursor after what was added.
  function focusBox() {
    const box = document.getElementById(boxId) as HTMLTextAreaElement | null;
    if (!box) return;

    const at = resume.current ?? box.value.length;
    resume.current = null;
    box.focus();
    box.setSelectionRange(at, at);
  }

  return {
    text,
    setText,
    mentions,
    gif,
    setGif,
    reserve,
    addEmoji,
    addMention,
    focusBox,
    // What is sent; empty when there is nothing to send.
    message: [withAts(text, mentions).trim(), gif].filter(Boolean).join("\n"),
    clear: () => {
      setDraft({ text: "", mentions: [] });
      setGifState(null);
    },
  };
}
