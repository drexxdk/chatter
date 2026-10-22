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
  function describe(group: TypingNotice[], target: "direct" | "room") {
    const names = new Intl.ListFormat(i18n.resolvedLanguage, {
      type: "conjunction",
    }).format(group.map((writer) => writer.nickname));
    return t(`typing.${target}${group.length > 3 ? "Count" : "Names"}`, {
      count: group.length,
      names,
    });
  }
  const text = direct.length
    ? describe(direct, "direct")
    : room.length
      ? describe(room, "room")
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
