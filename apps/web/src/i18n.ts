import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import da from "./locales/da.json";
import de from "./locales/de.json";
import en from "./locales/en.json";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "da", label: "Dansk" },
  { code: "de", label: "Deutsch" },
] as const;

const STORAGE_KEY = "chatter.language";

function initialLanguage(): string {
  const supported = LANGUAGES.map((language) => language.code) as string[];
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored && supported.includes(stored)) return stored;

  const browser = navigator.language.slice(0, 2).toLowerCase();
  return supported.includes(browser) ? browser : "en";
}

export function setLanguage(code: string): void {
  localStorage.setItem(STORAGE_KEY, code);
  void i18n.changeLanguage(code);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    da: { translation: da },
    de: { translation: de },
  },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (code) => {
  document.documentElement.lang = code;
});
document.documentElement.lang = i18n.language;

export default i18n;
