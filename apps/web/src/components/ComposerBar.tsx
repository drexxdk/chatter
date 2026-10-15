import { SendHorizontal } from "lucide-react";
import type { SubmitEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import type { useComposer } from "../chat/useComposer";
import { AttachedGif } from "./AttachedGif";
import { ComposerPicker } from "./ComposerPicker";
import { composerIconButton, ComposerSeparator } from "./composerControls";
import { IdleWarning } from "./IdleWarning";
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
  // How leading is laid out, for a page that shows it only some of the time.
  leadingClassName?: string;
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
  leadingClassName = "flex items-center",
  actions,
}: ComposerBarProps) {
  const { t } = useTranslation();

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
              !event.defaultPrevented &&
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
          <label id={"${id}-label"} className="sr-only">
            {label}
          </label>
          <MessageInput
            id={id}
            labelledBy={"${id}-label"}
            composer={composer}
            placeholder={placeholder}
            disabled={disabled}
            people={mentionable}
          />
          <div
            data-controls
            className="flex cursor-text items-center justify-end"
          >
            {/* The group's top and left lines meet the box's own border, which is its bottom and right; clipped to the box's corner. */}
            <div className="flex cursor-default items-center overflow-hidden rounded-br-[5px] rounded-tl-md border-l border-t border-neutral-700">
              {leading && (
                <div className={leadingClassName}>
                  {leading}
                  <ComposerSeparator />
                </div>
              )}
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
