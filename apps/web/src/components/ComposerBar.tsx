import { Megaphone, SendHorizontal } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type SubmitEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import type { useComposer } from "../chat/useComposer";
import type { TypingApi } from "../chat/useTyping";
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
  typing?: {
    update: TypingApi["update"];
    toGuestId?: string;
    enabled?: boolean;
  };
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
  typing,
}: ComposerBarProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLFormElement | null>(null);
  const updateTyping = typing?.update;
  const toGuestId = typing?.toGuestId;
  const typingEnabled = !!typing && typing.enabled !== false && !disabled;
  const reportTyping = useCallback(
    (active: boolean) => {
      if (typingEnabled) updateTyping?.(active, toGuestId);
    },
    [typingEnabled, updateTyping, toGuestId],
  );
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) reportTyping(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      reportTyping(false);
    };
  }, [reportTyping]);
  useLayoutEffect(() => {
    if (!anchor) return;
    const measure = () => {
      const bounds = Array.from(
        document.querySelectorAll<HTMLFormElement>("form[data-composer]"),
        (form) => form.getBoundingClientRect(),
      ).find((rect) => rect.height > 0);
      if (bounds) {
        document.documentElement.style.setProperty(
          "--composer-top",
          `${bounds.top}px`,
        );
      } else {
        document.documentElement.style.removeProperty("--composer-top");
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    if (anchor.parentElement) observer.observe(anchor.parentElement);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      queueMicrotask(measure);
    };
  }, [anchor]);

  return (
    <div className="composer-surface sticky bottom-0 z-20 space-y-2 bg-neutral-950 py-4">
      <ScrollToEnd />
      {alert}
      {above}

      {idleDeadline != null && <IdleWarning deadline={idleDeadline} />}

      <form
        ref={setAnchor}
        data-composer
        onSubmit={(event) => {
          reportTyping(false);
          onSubmit(event);
        }}
        className="relative"
      >
        {/* One box that looks like the text box and holds the controls, as in Teams; a click anywhere in it types. */}
        <div
          onClick={(event) => {
            if (
              event.target === event.currentTarget ||
              (event.target instanceof HTMLElement &&
                event.target.dataset.controls)
            ) {
              document.getElementById(id)?.focus({ preventScroll: true });
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
          className="composer-focus max-h-[calc(5*1.5rem+1rem+2px)] cursor-text overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 has-[[data-type=gif]]:max-h-[min(20rem,50dvh)] has-[[data-type=youtube]]:max-h-[min(20rem,50dvh)]"
        >
          <div className="flex min-w-0 items-end">
            <label id={"${id}-label"} className="sr-only">
              {label}
            </label>
            {!actions && (
              <div
                data-controls
                className="sticky bottom-0 flex shrink-0 cursor-default items-center self-end overflow-hidden rounded-l-[5px] bg-neutral-900"
              >
                <ComposerPicker
                  anchor={anchor}
                  disabled={disabled}
                  onEmoji={composer.addEmoji}
                  onGif={composer.addGif}
                  onYouTube={composer.addYouTube}
                  onClosed={composer.focusBox}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <MessageInput
                id={id}
                labelledBy={"${id}-label"}
                composer={composer}
                placeholder={placeholder}
                disabled={disabled}
                people={mentionable}
                onTyping={reportTyping}
              />
            </div>
            {/* On the box's last line, whatever its height; clipped to the box's corners (its own radius less its border). */}
            <div
              data-controls
              className="sticky bottom-0 flex shrink-0 cursor-default items-center self-end overflow-hidden rounded-r-[5px] bg-neutral-900"
            >
              {actions ?? (
                <>
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
                        anchor={anchor}
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
        </div>
      </form>
    </div>
  );
}
