import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { gifOf, gifStillUrl } from "../chat/gifs";

export const GifAttachment = Node.create({
  name: "gif",
  group: "inline",
  inline: true,
  atom: true,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const before = selection.$from.nodeBefore;
        if (!selection.empty || before?.type.name !== this.name) return false;
        return editor.commands.deleteRange({
          from: selection.from - before.nodeSize,
          to: selection.from,
        });
      },
      Delete: ({ editor }) => {
        const { selection } = editor.state;
        const after = selection.$from.nodeAfter;
        if (!selection.empty || after?.type.name !== this.name) return false;
        return editor.commands.deleteRange({
          from: selection.from,
          to: selection.from + after.nodeSize,
        });
      },
    };
  },
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'img[data-type="gif"]',
        getAttrs: (element) =>
          gifOf(element.getAttribute("src") ?? "") ? null : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { "data-type": "gif" })];
  },
  renderText({ node }) {
    return `\n${node.attrs.src}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachedGif);
  },
});

function AttachedGif({ node, deleteNode, selected, editor }: NodeViewProps) {
  const { t } = useTranslation();
  const url = node.attrs.src as string;

  return (
    <NodeViewWrapper
      as="span"
      data-type="gif"
      contentEditable={false}
      className="block max-w-full py-2 leading-none"
    >
      <span
        className={`relative inline-block max-w-full rounded-md ${selected ? "ring-2 ring-indigo-400" : ""}`}
      >
        <img
          src={gifStillUrl(url) ?? url}
          alt={t("gif.alt")}
          referrerPolicy="no-referrer"
          draggable={false}
          className="h-24 max-w-full rounded-md bg-neutral-800 object-contain"
        />
        <button
          type="button"
          onClick={() => {
            deleteNode();
            editor.commands.focus();
          }}
          disabled={!editor.isEditable}
          aria-label={t("gif.remove")}
          title={t("gif.remove")}
          className="absolute right-1 top-1 grid size-6 place-items-center rounded-full border border-neutral-600 bg-neutral-900 hover:bg-neutral-700"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </span>
    </NodeViewWrapper>
  );
}
