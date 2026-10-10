import { SendHorizontal } from "lucide-react";
import type { SubmitEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
  alert,
  above,
  below,
  leading,
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

      <form onSubmit={onSubmit}>
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
            onChange={(event) => composer.setText(event.target.value)}
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
