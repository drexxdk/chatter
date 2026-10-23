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
  const text = count
    ? t("typing.summary", {
        count,
        names: new Intl.ListFormat(i18n.resolvedLanguage, {
          type: "conjunction",
        }).format(subjects),
      })
    : "";
  return (
    <div
      role={text ? "status" : undefined}
      aria-label={text ? t("typing.label") : undefined}
      aria-live="polite"
      aria-atomic="true"
      data-typing-indicator
      className="min-h-5 text-sm text-neutral-400 wrap-break-word"
    >
      {text}
    </div>
  );
}
