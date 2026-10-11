import { SendHorizontal } from "lucide-react";
import {
  useState,
  type KeyboardEvent,
  type SubmitEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import { findMention, suggestMentions } from "../chat/mentions";
import type { useComposer } from "../chat/useComposer";
import { AttachedGif } from "./AttachedGif";
import { ComposerPicker } from "./ComposerPicker";
import { composerIconButton, ComposerSeparator } from "./composerControls";
import { IdleWarning } from "./IdleWarning";
import { MentionList } from "./MentionList";
import { MessageInput } from "./MessageInput";
import { ScrollToEnd } from "./ScrollToEnd";

interface ComposerBarProps {
  composer: ReturnType<typeof useComposer>;
  // The box's id, which is also the one the composer was made for.
  id: string;
  label: string;
  placeholder: string;
  // Turns off the box, the picker and the send button.
  disabled: boolean;
  onSubmit: (event: SubmitEvent) => void;
  // When the guest is disconnected for doing nothing, once they have been warned; shown right above the box.
  idleDeadline?: number | null;
  // Who an "@" in the message can name; without it, an "@" is just a character.
  mentionable?: Partner[];
  // Above the bar's controls: what went wrong with the last send.
  alert?: ReactNode;
  // Notes above and below the form.
  above?: ReactNode;
  below?: ReactNode;
  // Before the box, in the form.
  leading?: ReactNode;
  // In place of the picker and the send button.
  actions?: ReactNode;
}

// The bar kept at the bottom of the window in a room and in a private conversation: what is being written and the way
// to send it.
export function ComposerBar({
  composer,
  id,
  label,
  placeholder,
  disabled,
  onSubmit,
  idleDeadline,
  mentionable,
  alert,
  above,
  below,
  leading,
  actions,
}: ComposerBarProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  // The "@" whose list was closed with Escape stays closed while it is being written.
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [chosen, setChosen] = useState({ key: "", index: 0 });

  const mention =
    focused && mentionable
      ? findMention(composer.text, Math.min(caret, composer.text.length))
      : null;
  const matches =
    mention && mentionable ? suggestMentions(mentionable, mention.query) : [];
  const open =
    mention !== null && matches.length > 0 && closedAt !== mention.start;
  // The highlight goes back to the first name whenever what is written changes.
  const key = mention ? `${mention.start}:${mention.query}` : "";
  const active =
    chosen.key === key ? Math.min(chosen.index, matches.length - 1) : 0;
  const listId = `${id}-mentions`;

  function choose(person: Partner) {
    if (!mention) return;

    const end = Math.min(caret, composer.text.length);

    composer.addMention(mention.start, end, person.nickname);
    setCaret(mention.start + person.nickname.length + 1);
  }

  function handleListKeys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || !mention || event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setChosen({
        key,
        index: (active + step + matches.length) % matches.length,
      });
    } else if (
      (event.key === "Enter" || event.key === "Tab") &&
      !event.shiftKey
    ) {
      event.preventDefault();
      const person = matches[active];
      if (person) choose(person);
    } else if (event.key === "Escape") {
      // Closes the list only; Escape in the box otherwise moves to the messages.
      event.preventDefault();
      event.stopPropagation();
      setClosedAt(mention.start);
    }
  }

  return (
    <div className="sticky bottom-0 z-20 space-y-2 bg-neutral-950 pb-3 pt-2">
      <ScrollToEnd />
      {alert}
      {above}

      {composer.gif && (
        <AttachedGif
          url={composer.gif}
          onRemove={() => composer.setGif(null)}
        />
      )}

      {idleDeadline != null && <IdleWarning deadline={idleDeadline} />}

      <form onSubmit={onSubmit} className="relative">
        {open && (
          <MentionList
            id={listId}
            people={matches}
            active={active}
            onChoose={choose}
            onHover={(index) => setChosen({ key, index })}
          />
        )}
        {/* One box that looks like the text box and holds the controls, as in Teams; a click anywhere in it types. */}
        <div
          onClick={(event) => {
            if (
              event.target === event.currentTarget ||
              (event.target instanceof HTMLElement &&
                event.target.dataset.controls)
            ) {
              document.getElementById(id)?.focus();
            }
          }}
          onKeyDown={(event) => {
            // Escape in the box goes back to the messages, to the one that was last focused or else the newest.
            if (
              event.key === "Escape" &&
              event.target === document.getElementById(id) &&
              !event.nativeEvent.isComposing
            ) {
              document
                .querySelector<HTMLElement>(
                  '[role="log"] [data-nav-id][tabindex="0"]',
                )
                ?.focus();
            }
          }}
          className="cursor-text rounded-md border border-neutral-700 bg-neutral-900 focus-within:border-indigo-400"
        >
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <MessageInput
            id={id}
            value={composer.text}
            reserve={composer.reserve}
            highlights={composer.mentions}
            onChange={(event) => {
              const { value, selectionStart } = event.target;

              composer.setText(value);
              setCaret(selectionStart);
              if (
                closedAt !== null &&
                findMention(value, selectionStart)?.start !== closedAt
              ) {
                setClosedAt(null);
              }
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={handleListKeys}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? `${listId}-${active}` : undefined}
            autoComplete="off"
            disabled={disabled}
            placeholder={placeholder}
            className="block w-full min-w-0 bg-transparent px-3 pb-1 pt-2 outline-none disabled:opacity-60"
          />
          <div
            data-controls
            className="flex cursor-text items-center justify-end"
          >
            {/* The group's top and left lines meet the box's own border, which is its bottom and right; clipped to the box's corner. */}
            <div className="flex cursor-default items-center overflow-hidden rounded-br-[5px] rounded-tl-md border-l border-t border-neutral-700">
              {leading}
              {leading && <ComposerSeparator />}
              {actions ?? (
                <>
                  <ComposerPicker
                    disabled={disabled}
                    onEmoji={composer.addEmoji}
                    onGif={composer.setGif}
                    onClosed={composer.focusBox}
                  />
                  <ComposerSeparator />
                  <button
                    key="send"
                    type="submit"
                    disabled={disabled || !composer.message}
                    aria-label={t("room.send")}
                    className={`${composerIconButton} enabled:text-indigo-400 enabled:hover:text-indigo-300`}
                  >
                    <SendHorizontal aria-hidden="true" className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>

      {below}
    </div>
  );
}
