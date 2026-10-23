import { Play, RotateCw, Volume1, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_SOUNDS,
  notificationChannel,
  type NotificationChannel,
  type NotificationKind,
  type NotificationSoundId,
} from "../../../../shared/notificationPreferences.mjs";

import { playNotificationSound } from "../notificationSound";
import type { NotificationSoundPreferences } from "../preferences";

export function NotificationSoundSettings({
  value,
  onChange,
  status,
  onRetry,
}: {
  value: NotificationSoundPreferences;
  onChange: (value: NotificationSoundPreferences) => void;
  status?: "loading" | "saving" | "saved" | "load-error" | "save-error";
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const percent = Math.round(value.volume * 100);
  const changeChannel = (
    kind: NotificationKind,
    channel: NotificationChannel,
  ) =>
    onChange(
      kind === "private"
        ? { ...value, enabled: channel.enabled, sound: channel.sound }
        : { ...value, [kind]: channel },
    );
  return (
    <>
      <fieldset
        disabled={status === "loading" || status === "load-error"}
        className="min-w-0 space-y-4 disabled:opacity-50"
      >
        <div className="divide-y divide-neutral-700">
          {NOTIFICATION_KINDS.map((kind) => {
            const channel = notificationChannel(value, kind);
            const label = t(
              kind === "private"
                ? "notifications.enabled"
                : `notifications.${kind}`,
            );
            const previewLabel =
              kind === "private"
                ? t("notifications.preview")
                : t("notifications.previewCategory", { category: label });
            return (
              <div
                key={kind}
                className="grid grid-cols-1 items-center gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)] sm:gap-3"
              >
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    data-autofocus={kind === "private" ? true : undefined}
                    checked={channel.enabled}
                    onChange={(event) =>
                      changeChannel(kind, {
                        ...channel,
                        enabled: event.target.checked,
                      })
                    }
                    className="size-4 shrink-0 accent-indigo-500"
                  />
                  <span className="min-w-0 wrap-break-word">{label}</span>
                </label>
                <div className="flex min-w-0 items-center gap-2">
                  <select
                    aria-label={t("notifications.soundFor", {
                      category: label,
                    })}
                    value={channel.sound}
                    onChange={(event) =>
                      changeChannel(kind, {
                        ...channel,
                        sound: event.target.value as NotificationSoundId,
                      })
                    }
                    className="h-9 min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-indigo-400"
                  >
                    {NOTIFICATION_SOUNDS.map((sound) => (
                      <option key={sound} value={sound}>
                        {t(`notifications.sounds.${sound}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={previewLabel}
                    title={previewLabel}
                    onClick={() =>
                      void playNotificationSound(
                        kind === "private"
                          ? { preview: true }
                          : { preview: true, kind },
                      )
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-indigo-400"
                  >
                    <Play aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
              disabled={
                !NOTIFICATION_KINDS.some(
                  (kind) => notificationChannel(value, kind).enabled,
                )
              }
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
      </fieldset>
      {status && (
        <div className="mt-3 flex min-h-6 items-center justify-between gap-3 text-sm text-neutral-400">
          <span role={status.endsWith("error") ? "alert" : "status"}>
            {t(`notifications.${status}`)}
          </span>
          {status.endsWith("error") && (
            <button
              type="button"
              onClick={onRetry}
              aria-label={t("notifications.retry")}
              title={t("notifications.retry")}
              className="flex size-9 shrink-0 items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700"
            >
              <RotateCw aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
