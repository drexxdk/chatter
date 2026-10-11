import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState } from "react";

import { MAX_MESSAGE_LENGTH } from "./limits";
import { plainText } from "./plainText";

// What a guest is writing: the words, which the message box keeps and reports here as they are sent (a mention with its
// "@"), and a GIF they have added. Both go out as one message, the GIF as its last line.
export function useComposer() {
  const [text, setText] = useState("");
  const [gif, setGifState] = useState<string | null>(null);
  // The message box's editor, once it is there.
  const editor = useRef<Editor | null>(null);
  // The GIF's address and the line break before it count towards the message's length.
  const max = MAX_MESSAGE_LENGTH - (gif ? gif.length + 1 : 0);

  const attach = useCallback((attached: Editor | null) => {
    editor.current = attached;
  }, []);

  function addEmoji(emoji: string) {
    editor.current?.chain().insertContent(emoji).run();
  }

  function setGif(url: string | null) {
    setGifState(url);
    if (!url || !editor.current) return;

    // Room for the picture is made by cutting the words short rather than by refusing it.
    const room = MAX_MESSAGE_LENGTH - url.length - 1;
    const box = editor.current;

    while (plainText(box.state.doc).length > room) {
      const end = box.state.doc.content.size - 1;
      box.commands.deleteRange({ from: end - 1, to: end });
    }
  }

  // Back in the box after the picker closed, with the cursor where it was left.
  function focusBox() {
    editor.current?.commands.focus();
  }

  return {
    text,
    setText,
    gif,
    setGif,
    max,
    attach,
    addEmoji,
    focusBox,
    // What is sent; empty when there is nothing to send.
    message: [text.trim(), gif].filter(Boolean).join("\n"),
    clear: () => {
      editor.current?.commands.clearContent(true);
      setText("");
      setGifState(null);
    },
  };
}
