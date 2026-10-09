import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { DE, DK, GB } from "country-flag-icons/react/3x2";
import { useTranslation } from "react-i18next";

import { LANGUAGES, setLanguage } from "../i18n";

const FLAGS: Record<string, typeof GB> = {
  en: GB,
  da: DK,
  de: DE,
};

function Flag({ code }: { code: string }) {
  const Icon = FLAGS[code];

  return Icon ? (
    <Icon aria-hidden="true" className="h-4 w-6 shrink-0 rounded-sm" />
  ) : null;
}

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current =
    LANGUAGES.find((language) => language.code === i18n.resolvedLanguage) ??
    LANGUAGES[0];

  return (
    <Listbox value={current.code} onChange={setLanguage}>
      <ListboxButton
        aria-label={t("language.label")}
        className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
      >
        <Flag code={current.code} />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-400" />
      </ListboxButton>
      <ListboxOptions
        anchor="bottom end"
        className="z-50 min-w-40 rounded-md border border-slate-700 bg-slate-900 p-1 text-sm shadow-lg [--anchor-gap:0.25rem] focus:outline-none"
      >
        {LANGUAGES.map((language) => (
          <ListboxOption
            key={language.code}
            value={language.code}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 data-focus:bg-slate-800"
          >
            <Flag code={language.code} />
            <span className="flex-1">{language.label}</span>
            <Check
              aria-hidden="true"
              className={`h-4 w-4 text-indigo-300 ${language.code === current.code ? "" : "invisible"}`}
            />{" "}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
