import { Globe2, MessageSquare, Volume2 } from "lucide-react";
import { DE, DK, GB } from "country-flag-icons/react/3x2";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "../i18n";
import type { NotificationSoundPreferences } from "../preferences";
import { Modal } from "./Modal";
import { NotificationSoundSettings } from "./NotificationSoundDialog";
import { SettingsCheckbox } from "./SettingsCheckbox";

const FLAGS = { en: GB, da: DK, de: DE };

export function SettingsDialog({
  movements,
  notifications,
  onClose,
}: {
  movements: { checked: boolean; onChange: (checked: boolean) => void };
  notifications: {
    value: NotificationSoundPreferences;
    onChange: (value: NotificationSoundPreferences) => void;
    status?: "loading" | "saving" | "saved" | "load-error" | "save-error";
    onRetry: () => void;
  };
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const heading =
    "flex items-center gap-2 text-sm font-semibold text-neutral-200";
  return (
    <Modal title={t("settings.title")} onClose={onClose} closable size="wide">
      <div className="divide-y divide-neutral-700/70">
        <section className="space-y-4 pb-5" aria-labelledby="settings-general">
          <h3 id="settings-general" className={heading}>
            <Globe2 aria-hidden="true" className="size-4 text-neutral-400" />
            {t("settings.general")}
          </h3>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-neutral-400">
              {t("language.label")}
            </legend>
            <div className="@container grid grid-cols-3 gap-2">
              {LANGUAGES.map((language) => {
                const Flag = FLAGS[language.code as keyof typeof FLAGS];
                return (
                  <label
                    key={language.code}
                    className="relative min-w-0 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="settings-language"
                      value={language.code}
                      checked={i18n.resolvedLanguage === language.code}
                      onChange={() => setLanguage(language.code)}
                      className="peer sr-only"
                    />
                    <span className="flex h-full min-h-11 flex-col items-center justify-center gap-2 rounded border border-neutral-700 px-2 py-2 text-sm peer-checked:border-indigo-400 peer-checked:bg-indigo-500/10 peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-400 @min-[24rem]:flex-row">
                      {Flag && (
                        <Flag
                          aria-hidden="true"
                          className="h-3 w-5 shrink-0 rounded-sm"
                        />
                      )}
                      {language.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>
        <section className="space-y-3 py-5" aria-labelledby="settings-activity">
          <h3 id="settings-activity" className={heading}>
            <MessageSquare
              aria-hidden="true"
              className="size-4 text-neutral-400"
            />
            {t("settings.activity")}
          </h3>
          <SettingsCheckbox
            label={t("room.showMovements")}
            checked={movements.checked}
            onChange={movements.onChange}
          />
        </section>
        <section className="space-y-4 pt-5" aria-labelledby="settings-sounds">
          <h3 id="settings-sounds" className={heading}>
            <Volume2 aria-hidden="true" className="size-4 text-neutral-400" />
            {t("notifications.title")}
          </h3>
          <NotificationSoundSettings {...notifications} />
        </section>
      </div>
    </Modal>
  );
}
