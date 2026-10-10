import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";

import { MAX_MESSAGE_LENGTH } from "../chat/limits";

// The message box: one line to start with, growing with what is written up to five lines and scrolling inside itself
// after that. Enter sends, Shift+Enter starts a new line; on a touch screen Enter starts a new line and the Send button
// sends, so a line break never sends by accident.
export function MessageInput({
  value,
  reserve = 0,
  className = "",
  ...rest
}: Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "rows" | "maxLength" | "onKeyDown"
> & {
  // Characters of the message taken by something else, such as a GIF added to it.
  reserve?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const box = ref.current;
    if (!box) return;

    // The box growing pushes the page's end down; if the guest was at the end they should still be.
    const page = document.documentElement;
    const atEnd = page.scrollHeight - page.scrollTop - page.clientHeight < 120;

    box.style.height = "auto";
    box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;

    if (atEnd) page.scrollTop = page.scrollHeight;
  }, []);

  useLayoutEffect(fit, [value, fit]);

  // The same words take more or fewer lines when the box gets narrower or wider (a resized window, the styles arriving).
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === "undefined") return;

    let width = box.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (box.offsetWidth === width) return;

      width = box.offsetWidth;
      fit();
    });
    observer.observe(box);

    return () => observer.disconnect();
  }, [fit]);

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    const touch =
      typeof matchMedia === "function" && matchMedia("(hover: none)").matches;

    if (
      event.key === "Enter" &&
      !touch &&
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
      maxLength={MAX_MESSAGE_LENGTH - reserve}
      onKeyDown={submitOnEnter}
      // Five lines of text, the box's padding and its border. Empty, a long placeholder must not make it scroll.
      className={`max-h-[calc(5*1.5rem+1rem+2px)] resize-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap ${value ? "overflow-y-auto" : "overflow-hidden"} ${className}`}
      {...rest}
    />
  );
}
