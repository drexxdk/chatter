import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function clock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Shown right above the box while the guest is about to be disconnected for doing nothing, counting down to the moment
// it happens. The sentence is announced once; the ticking numbers are left for the eyes, so a screen reader is not
// interrupted every second.
export function IdleWarning({ deadline }: { deadline: number }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);

    return () => clearInterval(timer);
  }, [deadline]);

  return (
    <div
      data-testid="idle-warning"
      className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200"
    >
      <span role="alert">{t("room.idleWarning")}</span>
      <span aria-hidden="true" className="shrink-0 tabular-nums">
        {t("room.idleTimeLeft")}{" "}
        <strong className="font-semibold">{clock(deadline - now)}</strong>
      </span>
    </div>
  );
}
