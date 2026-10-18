import { Extension, mergeAttributes, type Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Mention from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Fragment, Slice, type Node } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";

import type { Partner } from "../chat/direct";
import { MAX_NAME_LENGTH, suggestMentions } from "../chat/mentions";
import { plainText } from "../chat/plainText";
import type { useComposer } from "../chat/useComposer";
import { isTouchScreen } from "../touch";
import { MentionList } from "./MentionList";
import { GifAttachment } from "./AttachedGif";

type Composer = ReturnType<typeof useComposer>;
type Chosen = { id: string; label: string };

// Enter sends and Shift+Enter starts a new line; on a touch screen Enter starts a new line and the Send button sends, so a
// line break never sends by accident. It ranks just below the mention list, which gets Enter first, and above the
// editor's own keys.
const SendOnEnter = Extension.create({
  name: "sendOnEnter",
  priority: 100.5,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (editor.view.composing) return false;
        if (isTouchScreen()) return editor.commands.setHardBreak();

        editor.view.dom.closest("form")?.requestSubmit();
        return true;
      },
    };
  },
});

// A message has one paragraph, with line breaks in it, so that what is in the box is the same as what is sent.
const OneParagraph = Document.extend({ content: "paragraph" });

// What is pasted is words: formatting is left out, and so is what does not fit.
function pasteAsWords(
  view: Editor["view"],
  event: ClipboardEvent,
  room: number,
) {
  const pasted = event.clipboardData?.getData("text/plain");
  if (!pasted) return false;

  const { schema } = view.state;
  const lineBreak = schema.nodes.hardBreak;
  if (!lineBreak) return false;

  const lines = pasted.replace(/\r\n?/g, "\n").slice(0, room).split("\n");
  const content: Node[] = lines.flatMap((line, index) => [
    ...(index > 0 ? [lineBreak.create()] : []),
    ...(line === "" ? [] : [schema.text(line)]),
  ]);

  view.dispatch(
    view.state.tr.replaceSelection(new Slice(Fragment.from(content), 0, 0)),
  );
  return true;
}

// The message box: one line to start with, growing with what is written up to five lines and scrolling inside itself
// after that. An editor rather than a text box, so that a person chosen with "@" can be a name in colour that is kept
// and deleted as a whole. What is in it is `composer.text`, the words as they are sent.
export function MessageInput({
  id,
  labelledBy,
  composer,
  placeholder,
  disabled,
  people,
}: {
  id: string;
  // The element that names the box.
  labelledBy: string;
  composer: Composer;
  placeholder: string;
  disabled: boolean;
  // Who an "@" can name; without it, an "@" is just a character.
  people?: Partner[];
}) {
  const [suggestion, setSuggestion] = useState<SuggestionProps<
    Partner,
    Chosen
  > | null>(null);
  const [active, setActive] = useState(0);
  // Who the "@" being written could name, from who is here now: the room changes without the box changing.
  const matches = suggestion
    ? suggestMentions(people ?? [], suggestion.query)
    : [];
  // What the editor's callbacks need. They are made once, so they look here for the latest of what this was given.
  const latest = useRef({ composer, people, suggestion, matches, active });
  useLayoutEffect(() => {
    latest.current = { composer, people, suggestion, matches, active };
  });

  const editor = useEditor({
    extensions: [
      OneParagraph,
      Paragraph,
      Text,
      HardBreak,
      GifAttachment,
      UndoRedo,
      SendOnEnter,
      Mention.configure({
        HTMLAttributes: { class: "text-indigo-400" },
        // The name alone is shown, as in Teams; the "@" is how it goes out.
        renderHTML: ({ options, node }) => [
          "span",
          mergeAttributes(options.HTMLAttributes),
          node.attrs.label,
        ],
        renderText: ({ node }) => `@${node.attrs.label}`,
        // Backspace takes the name out whole, rather than leaving the "@" to choose again.
        deleteTriggerWithBackspace: true,
        suggestion: {
          char: "@",
          // A nickname can have spaces in it.
          allowSpaces: true,
          items: ({ query }) =>
            suggestMentions(latest.current.people ?? [], query),
          // With nobody to offer there is no list, and so the keys stay the box's own.
          shouldShow: ({ query }) =>
            query.length <= MAX_NAME_LENGTH &&
            suggestMentions(latest.current.people ?? [], query).length > 0,
          render: () => ({
            onStart: (props) => {
              setSuggestion(props);
              setActive(0);
            },
            onUpdate: (props) => {
              if (latest.current.suggestion?.query !== props.query) {
                setActive(0);
              }
              setSuggestion(props);
            },
            onExit: () => setSuggestion(null),
            onKeyDown: ({ event }) => {
              const {
                suggestion: open,
                matches: offered,
                active: current,
              } = latest.current;
              if (!open || offered.length === 0 || event.isComposing) {
                return false;
              }

              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const step = event.key === "ArrowDown" ? 1 : -1;
                setActive((current + step + offered.length) % offered.length);
                return true;
              }

              if (
                (event.key === "Enter" || event.key === "Tab") &&
                !event.shiftKey
              ) {
                const person = offered[current];
                if (person) {
                  open.command({ id: person.guestId, label: person.nickname });
                }
                return true;
              }

              return false;
            },
          }),
        },
      }),
      // Nothing is accepted that would make the message longer than it can be, unless it makes it shorter.
      Extension.create({
        name: "limit",
        addProseMirrorPlugins: () => [
          new Plugin({
            filterTransaction: (tr) =>
              !tr.docChanged ||
              plainText(tr.doc).length <= latest.current.composer.max ||
              plainText(tr.doc).length <= plainText(tr.before).length,
          }),
        ],
      }),
    ],
    editable: !disabled,
    // The list belongs to the cursor in the box (choosing from it keeps the focus there, see MentionList).
    onBlur: () => setSuggestion(null),
    onUpdate: ({ editor: updated }) =>
      latest.current.composer.setText(
        plainText(updated.state.doc, false),
        plainText(updated.state.doc),
      ),
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        class:
          "block w-full min-w-0 max-h-[calc(5*1.5rem+1rem+2px)] has-[[data-type=gif]]:max-h-[min(20rem,50dvh)] overflow-y-auto whitespace-pre-wrap wrap-anywhere px-3 pb-1 pt-2 outline-none",
      },
      handlePaste: (view, event) => {
        const { doc, selection } = view.state;
        const replaced = plainText(doc.cut(selection.from, selection.to));
        const room =
          latest.current.composer.max - plainText(doc).length + replaced.length;

        return pasteAsWords(view, event, Math.max(room, 0));
      },
    },
  });

  const { attach } = composer;
  useEffect(() => {
    attach(editor);

    return () => attach(null);
  }, [editor, attach]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // What the editable element says about itself, which can change while it stays.
  const listId = `${id}-mentions`;
  const shown = suggestion !== null && matches.length > 0;
  useEffect(() => {
    const box = editor?.view.dom;
    if (!box) return;

    const set = (name: string, value: string | undefined) =>
      value === undefined
        ? box.removeAttribute(name)
        : box.setAttribute(name, value);

    set("aria-labelledby", labelledBy);
    set("aria-placeholder", placeholder);
    set("aria-disabled", disabled ? "true" : undefined);
    set("aria-controls", shown ? listId : undefined);
    set("aria-activedescendant", shown ? `${listId}-${active}` : undefined);
  }, [editor, labelledBy, placeholder, disabled, shown, listId, active]);

  // The box growing pushes the page's end down; if the guest was at the end they should still be.
  useEffect(() => {
    const box = editor?.view.dom;
    if (!box || typeof ResizeObserver === "undefined") return;

    let height = box.offsetHeight;
    const observer = new ResizeObserver(() => {
      const grew = box.offsetHeight - height;
      height = box.offsetHeight;
      if (grew === 0) return;

      const page = document.documentElement;
      const wasAtEnd =
        page.scrollHeight - grew - page.scrollTop - page.clientHeight < 120;
      if (wasAtEnd) page.scrollTop = page.scrollHeight;
    });
    observer.observe(box);

    return () => observer.disconnect();
  }, [editor]);

  return (
    <div className={clsx("relative", disabled && "opacity-60")}>
      {shown && (
        <MentionList
          id={listId}
          people={matches}
          active={Math.min(active, matches.length - 1)}
          onChoose={(person) =>
            suggestion.command({ id: person.guestId, label: person.nickname })
          }
          onHover={setActive}
        />
      )}
      {composer.message === "" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-2 truncate text-neutral-500"
        >
          {placeholder}
        </span>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
