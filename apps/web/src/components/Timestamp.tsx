import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { ageBucket } from "../chat/age";
import { formatClock } from "../chat/clock";

const TICK_MS = 5_000;

// One timer for all the times on screen, running only while there are any.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => listeners.forEach((notify) => notify()), TICK_MS);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// When something was sent: "a few seconds ago" and "N minutes ago" at first, later the time of day. It updates itself,
// and only draws again when the words change.
export function Timestamp({
  sentAt,
  className,
}: {
  sentAt: string;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const bucket = useSyncExternalStore(subscribe, () =>
    ageBucket(sentAt, Date.now()),
  );

  return (
    <time dateTime={sentAt} className={className}>
      {bucket < 0
        ? formatClock(sentAt, i18n.resolvedLanguage)
        : bucket === 0
          ? t("time.fewSecondsAgo")
          : t("time.minutesAgo", { count: bucket })}
    </time>
  );
}
