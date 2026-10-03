import { useTranslation } from "react-i18next";

import { LANGUAGES, setLanguage } from "../i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      {t("language.label")}
      <select
        value={i18n.resolvedLanguage}
        onChange={(event) => setLanguage(event.target.value)}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
      >
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
