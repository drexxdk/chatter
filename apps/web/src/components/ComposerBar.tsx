import { Megaphone, SendHorizontal } from "lucide-react";
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
import { SendModeMenu } from "./SendModeMenu";

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
  // Notes above the form.
  above?: ReactNode;
  // For a moderator: what is written can go out as an announcement, which the send button then says, and a menu beside
  // it chooses between that and a message.
  announce?: { active: boolean; onChange: (active: boolean) => void };
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
  announce,
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
          className="flex cursor-text items-end rounded-md border border-neutral-700 bg-neutral-900 focus-within:border-indigo-400"
        >
          <label id={"${id}-label"} className="sr-only">
            {label}
          </label>
          <div className="min-w-0 flex-1">
            <MessageInput
              id={id}
              labelledBy={"${id}-label"}
              composer={composer}
              placeholder={placeholder}
              disabled={disabled}
              people={mentionable}
            />
          </div>
          {/* On the box's last line, whatever its height; clipped to the box's corners (its own radius less its border). */}
          <div
            data-controls
            className="flex shrink-0 cursor-default items-center self-end overflow-hidden rounded-r-[5px]"
          >
            <ComposerSeparator />
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
                  disabled={
                    disabled ||
                    !(announce?.active
                      ? composer.text.trim()
                      : composer.message)
                  }
                  aria-label={t(
                    announce?.active ? "announcement.send" : "room.send",
                  )}
                  className={`${composerIconButton} ${
                    announce?.active
                      ? "enabled:text-green-400 enabled:hover:text-green-300"
                      : "enabled:text-indigo-400 enabled:hover:text-indigo-300"
                  }`}
                >
                  {announce?.active ? (
                    <Megaphone aria-hidden="true" className="h-5 w-5" />
                  ) : (
                    <SendHorizontal aria-hidden="true" className="h-5 w-5" />
                  )}
                </button>
                {announce && (
                  <>
                    <ComposerSeparator />
                    <SendModeMenu
                      announce={announce.active}
                      disabled={disabled}
                      onChange={announce.onChange}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
