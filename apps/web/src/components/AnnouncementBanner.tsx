import { useTranslation } from "react-i18next";

import type { Announcement } from "../chat/useChat";

export function AnnouncementBanner({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section
      aria-label={t("announcement.title")}
      className="flex items-start justify-between gap-3 rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold uppercase text-green-400">
          {t("announcement.from", { name: announcement.name })}
        </p>
        {/* Rendered as text, never as HTML. */}
        <p className="whitespace-pre-wrap break-words font-bold text-green-300">
          {announcement.text}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md px-2 py-1 text-sm text-green-200 hover:bg-green-500/20"
      >
        {t("announcement.dismiss")}
      </button>
    </section>
  );
}
