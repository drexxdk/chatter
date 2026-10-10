import { useLayoutEffect, useRef, useState } from "react";

import { MAX_MESSAGE_LENGTH } from "./limits";

// What a guest is writing: the words, and a GIF they have added. Both go out as one message, the GIF as its last line.
// Emoji are put in at the cursor of the box named by `boxId`.
export function useComposer(boxId: string) {
  const [text, setText] = useState("");
  const [gif, setGifState] = useState<string | null>(null);
  const caret = useRef<number | null>(null);
  // Where the cursor goes when the box is focused again: focusing a box resets it to the start.
  const resume = useRef<number | null>(null);
  // The GIF's address and the line break before it count towards the message's length.
  const reserve = gif ? gif.length + 1 : 0;
  const max = MAX_MESSAGE_LENGTH - reserve;

  // Moves the cursor to where the emoji ended, once the box shows the new text.
  useLayoutEffect(() => {
    if (caret.current === null) return;

    const box = document.getElementById(boxId) as HTMLTextAreaElement | null;
    box?.setSelectionRange(caret.current, caret.current);
    resume.current = caret.current;
    caret.current = null;
  }, [text, boxId]);

  function addEmoji(emoji: string) {
    const box = document.getElementById(boxId) as HTMLTextAreaElement | null;
    const start = Math.min(box?.selectionStart ?? text.length, text.length);
    const end = Math.min(box?.selectionEnd ?? start, text.length);
    const next = text.slice(0, start) + emoji + text.slice(end);

    if (next.length > max) return;

    caret.current = start + emoji.length;
    setText(next);
  }

  function setGif(url: string | null) {
    setGifState(url);
    resume.current = null;
    // Room for the picture is made by cutting the words short rather than by refusing it.
    if (url)
      setText((current) =>
        current.slice(0, MAX_MESSAGE_LENGTH - url.length - 1),
      );
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
    gif,
    setGif,
    reserve,
    addEmoji,
    focusBox,
    // What is sent; empty when there is nothing to send.
    message: [text.trim(), gif].filter(Boolean).join("\n"),
    clear: () => {
      setText("");
      setGifState(null);
    },
  };
}
