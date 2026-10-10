import { SendHorizontal } from "lucide-react";
import type { SubmitEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { useComposer } from "../chat/useComposer";
import { AttachedGif } from "./AttachedGif";
import { ComposerPicker } from "./ComposerPicker";
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
  alert,
  above,
  below,
  leading,
  actions,
}: ComposerBarProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky bottom-0 z-20 space-y-2 bg-slate-950 pb-3 pt-2">
      <ScrollToEnd />
      {alert}
      {above}

      {composer.gif && (
        <AttachedGif
          url={composer.gif}
          onRemove={() => composer.setGif(null)}
        />
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
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
          className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
        />
        <div className="flex items-center gap-2">
          {leading}
          <div className="ml-auto flex items-center gap-2">
            {actions ?? (
              <>
                <ComposerPicker
                  disabled={disabled}
                  onEmoji={composer.addEmoji}
                  onGif={composer.setGif}
                  onClosed={composer.focusBox}
                />
                <button
                  key="send"
                  type="submit"
                  disabled={disabled || !composer.message}
                  aria-label={t("room.send")}
                  className="rounded-md bg-indigo-600 px-3 py-2 font-medium hover:bg-indigo-500 disabled:opacity-60"
                >
                  <SendHorizontal aria-hidden="true" className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </form>

      {below}
    </div>
  );
}
