import type { Node } from "@tiptap/pm/model";

// What the box holds as the words that are sent: line breaks as they are, and each mention with its "@".
export function plainText(doc: Node, includeGifUrls = true): string {
  return doc.textBetween(0, doc.content.size, "\n", (leaf) =>
    leaf.type.name === "hardBreak"
      ? "\n"
      : leaf.type.name === "mention"
        ? `@${leaf.attrs.label}`
        : leaf.type.name === "gif" || leaf.type.name === "youtube"
          ? includeGifUrls
            ? `\n${leaf.attrs.src}\n`
            : "\n"
          : "",
  );
}
