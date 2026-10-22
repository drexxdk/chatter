import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_MESSAGE_LENGTH } from "./limits";
import { sendableGifUrl } from "./gifs";
import { youtubeEmbedUrl } from "./youtube";
import { plainText } from "./plainText";
import { readTabDraft, writeTabDraft } from "../tabDraft";

export function useComposer(draftKey?: string, draftRecipient?: string) {
  const [draft, setDraft] = useState({ text: "", message: "" });
  // The message box's editor, once it is there.
  const editor = useRef<Editor | null>(null);
  const restored = useRef<Editor | null>(null);
  const max = MAX_MESSAGE_LENGTH;

  const attach = useCallback(
    (attached: Editor | null) => {
      editor.current = attached;
      if (!attached || !draftKey || restored.current === attached) return;
      restored.current = attached;
      const saved = readTabDraft(draftKey);
      if (!saved || typeof saved !== "object" || !("document" in saved)) return;
      if (
        ("recipient" in saved ? saved.recipient : undefined) !== draftRecipient
      ) {
        writeTabDraft(draftKey, undefined);
        return;
      }
      try {
        const document = attached.schema.nodeFromJSON(saved.document);
        document.check();
        if (plainText(document).length > MAX_MESSAGE_LENGTH)
          throw new Error("Draft too long");
        attached.commands.setContent(document.toJSON(), {
          errorOnInvalidContent: true,
        });
      } catch {
        writeTabDraft(draftKey, undefined);
      }
    },
    [draftKey, draftRecipient],
  );

  useEffect(() => {
    const box = editor.current;
    if (!draftKey || !box) return;
    writeTabDraft(
      draftKey,
      plainText(box.state.doc)
        ? {
            document: box.getJSON(),
            recipient: draftRecipient,
          }
        : undefined,
    );
  }, [draftKey, draftRecipient]);

  function addEmoji(emoji: string) {
    editor.current?.chain().insertContent(emoji).run();
  }

  function addGif(address: string) {
    addAttachment("gif", sendableGifUrl(address));
  }

  function addYouTube(address: string) {
    addAttachment("youtube", youtubeEmbedUrl(address));
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
    setText: (text: string, message = text) => {
      setDraft({ text, message });
      if (draftKey)
        writeTabDraft(
          draftKey,
          text || message
            ? {
                document: editor.current?.getJSON(),
                recipient: draftRecipient,
              }
            : undefined,
        );
    },
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
      if (draftKey) writeTabDraft(draftKey, undefined);
    },
  };
}
