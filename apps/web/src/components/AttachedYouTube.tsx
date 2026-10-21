import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { youtubeEmbedUrl } from "../chat/youtube";
import { GifAttachment } from "./AttachedGif";
import { YouTubeEmbed } from "./YouTubeEmbed";

export const YouTubeAttachment = GifAttachment.extend({
  name: "youtube",
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) =>
          youtubeEmbedUrl(element.getAttribute("src") ?? ""),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'iframe[data-type="youtube"]',
        getAttrs: (element) => {
          const src = youtubeEmbedUrl(element.getAttribute("src") ?? "");
          return src ? { src } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "iframe",
      {
        "data-type": "youtube",
        src: youtubeEmbedUrl(node.attrs.src),
        title: "YouTube",
      },
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachedYouTube);
  },
});

function AttachedYouTube({
  node,
  deleteNode,
  selected,
  editor,
}: NodeViewProps) {
  const { t } = useTranslation();
  return (
    <NodeViewWrapper
      as="span"
      data-type="youtube"
      contentEditable={false}
      className="block max-w-full py-2 leading-none"
    >
      <span
        className={`relative block w-72 max-w-full rounded-md ${selected ? "ring-2 ring-indigo-400" : ""}`}
      >
        <YouTubeEmbed url={node.attrs.src as string} preview />
        <button
          type="button"
          onClick={() => {
            editor.view.dispatch(closeHistory(editor.state.tr));
            deleteNode();
            editor.commands.focus();
          }}
          disabled={!editor.isEditable}
          aria-label={t("youtube.remove")}
          title={t("youtube.remove")}
          className="absolute right-1 top-1 grid size-6 place-items-center rounded-full border border-neutral-600 bg-neutral-900 hover:bg-neutral-700"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </span>
    </NodeViewWrapper>
  );
}
