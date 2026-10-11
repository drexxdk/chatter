import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { MAX_MESSAGE_LENGTH } from "../chat/limits";
import type { DraftMention } from "../chat/useComposer";
import { isTouchScreen } from "../touch";

// The message box: one line to start with, growing with what is written up to five lines and scrolling inside itself
// after that. Enter sends, Shift+Enter starts a new line; on a touch screen Enter starts a new line and the Send button
// sends, so a line break never sends by accident.
export function MessageInput({
  value,
  reserve = 0,
  highlights = [],
  className = "",
  onKeyDown,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows" | "maxLength"> & {
  // Characters of the message taken by something else, such as a GIF added to it.
  reserve?: number;
  // Parts of the text shown in colour, as a mention is in a message. A box cannot colour part of its own text, so a copy
  // of the text is drawn behind it, in the same place, and the box's own text is left invisible.
  highlights?: DraftMention[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  // The width of the scrollbar the box has once it is full, which the copy has to leave room for to wrap at the same place.
  const [gutter, setGutter] = useState(0);
  const marked = highlights.length > 0;

  const fit = useCallback(() => {
    const box = ref.current;
    if (!box) return;

    // The box growing pushes the page's end down; if the guest was at the end they should still be.
    const page = document.documentElement;
    const atEnd = page.scrollHeight - page.scrollTop - page.clientHeight < 120;

    box.style.height = "auto";
    box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
    setGutter(box.offsetWidth - box.clientWidth);

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
    // The owner may take a key for itself (a list of suggestions, say) by preventing its default.
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const touch = isTouchScreen();

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

  // The text in pieces, the highlighted ones in the colour of a mention. The last character keeps a final line break from
  // being dropped, so the copy is as tall as the box.
  const copy: ReactNode[] = [];
  if (marked) {
    const text = String(value ?? "");
    let at = 0;

    for (const { start, end } of highlights) {
      copy.push(text.slice(at, start));
      copy.push(
        <span key={start} className="text-indigo-400">
          {text.slice(start, end)}
        </span>,
      );
      at = end;
    }

    copy.push(text.slice(at), "\u200b");
  }

  return (
    <div className="relative">
      {marked && (
        <div
          ref={mirror}
          aria-hidden="true"
          // The padding is the box's own (`className`), and the scrollbar's width on top of it on the right.
          style={{ paddingRight: `calc(0.75rem + ${gutter}px)` }}
          className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap wrap-anywhere ${className}`}
        >
          {copy}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_MESSAGE_LENGTH - reserve}
        onKeyDown={submitOnEnter}
        onScroll={(event) => {
          if (mirror.current) {
            mirror.current.scrollTop = event.currentTarget.scrollTop;
          }
        }}
        // Five lines of text, the box's padding and its border. Empty, a long placeholder must not make it scroll.
        className={`max-h-[calc(5*1.5rem+1rem+2px)] resize-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap ${value ? "overflow-y-auto" : "overflow-hidden"} ${marked ? "text-transparent caret-neutral-100" : ""} ${className}`}
        {...rest}
      />
    </div>
  );
}
