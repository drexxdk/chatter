import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  Check,
  ChevronDown,
  Play,
  RotateCw,
  Volume1,
  Volume2,
} from "lucide-react";
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
import { MENU_ITEM, MENU_SURFACE } from "./dropdown";
import { SettingsCheckbox } from "./SettingsCheckbox";

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
                <SettingsCheckbox
                  label={label}
                  disabled={status === "loading" || status === "load-error"}
                  checked={channel.enabled}
                  onChange={(enabled) =>
                    changeChannel(kind, { ...channel, enabled })
                  }
                />
                <div className="flex min-w-0 items-center gap-2">
                  <Listbox
                    value={channel.sound}
                    disabled={status === "loading" || status === "load-error"}
                    onChange={(sound: NotificationSoundId) =>
                      changeChannel(kind, {
                        ...channel,
                        sound,
                      })
                    }
                  >
                    <ListboxButton
                      aria-label={t("notifications.soundFor", {
                        category: label,
                      })}
                      className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-900 px-2 text-left text-sm outline-none focus-visible:outline-2 focus-visible:outline-indigo-400 data-disabled:cursor-default"
                    >
                      <span className="truncate">
                        {t(`notifications.sounds.${channel.sound}`)}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 shrink-0 text-neutral-400"
                      />
                    </ListboxButton>
                    <ListboxOptions
                      anchor={{ to: "bottom start", gap: 4, padding: 8 }}
                      modal={false}
                      className={`${MENU_SURFACE} z-70 max-h-64 w-(--button-width) min-w-28`}
                    >
                      {NOTIFICATION_SOUNDS.map((sound) => (
                        <ListboxOption
                          key={sound}
                          value={sound}
                          className={`${MENU_ITEM} group gap-2 px-2 py-1.5`}
                        >
                          <span className="flex-1">
                            {t(`notifications.sounds.${sound}`)}
                          </span>
                          <Check
                            aria-hidden="true"
                            className="invisible size-4 shrink-0 group-data-selected:visible"
                          />
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </Listbox>
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
