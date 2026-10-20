import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { useCallback, useRef, useState } from "react";

import { MAX_MESSAGE_LENGTH } from "./limits";
import { sendableGifUrl } from "./gifs";
import { youtubeUrl } from "./youtube";
import { plainText } from "./plainText";

export function useComposer() {
  const [draft, setDraft] = useState({ text: "", message: "" });
  // The message box's editor, once it is there.
  const editor = useRef<Editor | null>(null);
  const max = MAX_MESSAGE_LENGTH;

  const attach = useCallback((attached: Editor | null) => {
    editor.current = attached;
  }, []);

  function addEmoji(emoji: string) {
    editor.current?.chain().insertContent(emoji).run();
  }

  function addGif(address: string) {
    addAttachment("gif", sendableGifUrl(address));
  }

  function addYouTube(address: string) {
    addAttachment("youtube", youtubeUrl(address));
  }

  function addAttachment(type: "gif" | "youtube", url: string | null) {
    const box = editor.current;
    const attachment = box?.schema.nodes[type];
    if (!url || !box || !attachment) return;

    const transaction = box.state.tr.replaceSelectionWith(
      attachment.create({ src: url }),
    );
    while (plainText(transaction.doc).length > max) {
      let lastText: { from: number; to: number } | undefined;
      transaction.doc.descendants((node, position) => {
        if (node.isText && node.text) {
          const size = Array.from(node.text).at(-1)!.length;
          lastText = {
            from: position + node.nodeSize - size,
            to: position + node.nodeSize,
          };
        }
      });
      if (!lastText) return;
      transaction.delete(lastText.from, lastText.to);
    }
    box.view.dispatch(closeHistory(transaction).scrollIntoView());
  }

  // Back in the box after the picker closed, with the cursor where it was left.
  function focusBox() {
    editor.current?.commands.focus();
  }

  return {
    text: draft.text,
    setText: (text: string, message = text) => setDraft({ text, message }),
    addGif,
    addYouTube,
    max,
    attach,
    addEmoji,
    focusBox,
    // What is sent; empty when there is nothing to send.
    message: draft.message.trim(),
    clear: () => {
      editor.current?.commands.clearContent(true);
      setDraft({ text: "", message: "" });
    },
  };
}
