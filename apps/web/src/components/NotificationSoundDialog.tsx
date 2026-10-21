import { Play, Volume1, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { playNotificationSound } from "../notificationSound";
import type { NotificationSoundPreferences } from "../preferences";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function NotificationSoundDialog({
  value,
  onChange,
  onClose,
}: {
  value: NotificationSoundPreferences;
  onChange: (value: NotificationSoundPreferences) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const percent = Math.round(value.volume * 100);
  return (
    <Modal title={t("notifications.title")} onClose={onClose} closable>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          data-autofocus
          checked={value.enabled}
          onChange={(event) =>
            onChange({ ...value, enabled: event.target.checked })
          }
          className="size-4 shrink-0 accent-indigo-500"
        />
        {t("notifications.enabled")}
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor="notification-volume">
            {t("notifications.volume")}
          </label>
          <output
            htmlFor="notification-volume"
            className="w-12 text-right tabular-nums text-neutral-400"
          >
            {percent}%
          </output>
        </div>
        <div className="flex items-center gap-3">
          <Volume1
            aria-hidden="true"
            className="size-4 shrink-0 text-neutral-400"
          />
          <input
            id="notification-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            aria-valuetext={`${percent}%`}
            disabled={!value.enabled}
            onChange={(event) =>
              onChange({ ...value, volume: Number(event.target.value) / 100 })
            }
            className="h-6 min-w-0 flex-1 cursor-pointer accent-indigo-400 disabled:cursor-default disabled:opacity-40"
          />
          <Volume2
            aria-hidden="true"
            className="size-4 shrink-0 text-neutral-400"
          />
        </div>
      </div>
      <Button
        icon={Play}
        disabled={!value.enabled || value.volume === 0}
        onClick={() => void playNotificationSound()}
      >
        {t("notifications.preview")}
      </Button>
    </Modal>
  );
}
