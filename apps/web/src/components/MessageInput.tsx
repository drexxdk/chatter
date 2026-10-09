import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";

import { MAX_MESSAGE_LENGTH } from "../chat/limits";

// The message box: one line to start with, growing with what is written up to five lines and scrolling inside itself
// after that. Enter sends, Shift+Enter starts a new line.
export function MessageInput({
  value,
  className = "",
  ...rest
}: Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "rows" | "maxLength" | "onKeyDown"
>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;

    // The box growing pushes the page's end down; if the guest was at the end they should still be.
    const page = document.documentElement;
    const atEnd = page.scrollHeight - page.scrollTop - page.clientHeight < 120;

    box.style.height = "auto";
    box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;

    if (atEnd) page.scrollTop = page.scrollHeight;
  }, [value]);

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={MAX_MESSAGE_LENGTH}
      onKeyDown={submitOnEnter}
      // Five lines of text, the box's padding and its border.
      className={`max-h-[calc(5*1.5rem+1rem+2px)] resize-none overflow-y-auto ${className}`}
      {...rest}
    />
  );
}
