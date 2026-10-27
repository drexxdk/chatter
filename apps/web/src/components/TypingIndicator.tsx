import { useTranslation } from "react-i18next";
import type { TypingNotice } from "../../../../shared/chatProtocol.mjs";

export function TypingIndicator({
  writers,
  roomSlug,
  blockedIds = [],
}: {
  writers: readonly TypingNotice[];
  roomSlug?: string;
  blockedIds?: readonly string[];
}) {
  const { t, i18n } = useTranslation();
  const visible = writers.filter(
    (writer) => !blockedIds.includes(writer.guestId),
  );
  const direct = visible.filter((writer) => writer.toGuestId !== undefined);
  const room = visible.filter(
    (writer) => roomSlug !== undefined && writer.roomSlug === roomSlug,
  );
  const count = direct.length + room.length;
  const named = count <= 3 ? [...direct, ...room] : direct;
  const subjects = named.map((writer) => writer.nickname);
  const remaining = count - named.length;
  if (remaining)
    subjects.push(
      t(named.length ? "typing.others" : "typing.people", { count: remaining }),
    );
  const names = new Intl.ListFormat(i18n.resolvedLanguage, {
    type: "conjunction",
  }).format(subjects);
  const text = count
    ? t("typing.summary", {
        count,
        names,
      })
    : "";
  return (
    <div
      data-typing-indicator
      className="flex min-h-5 min-w-0 items-baseline text-sm text-neutral-400"
    >
      <span
        role={text ? "status" : undefined}
        aria-label={text ? t("typing.label") : undefined}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {text}
      </span>
      {text && (
        <>
          <span aria-hidden="true" className="min-w-0 truncate">
            {names}
          </span>
          <span
            aria-hidden="true"
            className="typing-dots shrink-0 whitespace-pre"
          >
            {" "}
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </>
      )}
    </div>
  );
}
