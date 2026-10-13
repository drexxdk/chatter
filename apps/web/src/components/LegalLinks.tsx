import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { ABOUT_PATH, PRIVACY_PATH, TERMS_PATH } from "../place";

export const LINK =
  "text-indigo-300 underline hover:text-indigo-200 focus-visible:outline-2 focus-visible:outline-indigo-400";

// Stand in for the two links while the sentence is translated, so each language can put them where its grammar wants.
const TERMS_TOKEN = "[[terms]]";
const PRIVACY_TOKEN = "[[privacy]]";

// A translated sentence with `{terms}` and `{privacy}` in it, shown with those two words as links that open the documents
// in a new tab, so that what the guest has typed is not lost.
export function LegalSentence({ i18nKey }: { i18nKey: string }) {
  const { t } = useTranslation();
  const sentence = t(i18nKey, { terms: TERMS_TOKEN, privacy: PRIVACY_TOKEN });

  return (
    <>
      {sentence.split(/(\[\[terms\]\]|\[\[privacy\]\])/).map((part, index) => {
        if (part === TERMS_TOKEN || part === PRIVACY_TOKEN) {
          const terms = part === TERMS_TOKEN;

          return (
            <a
              key={index}
              href={terms ? TERMS_PATH : PRIVACY_PATH}
              target="_blank"
              rel="noopener"
              className={LINK}
            >
              {t(terms ? "terms.termsLink" : "terms.privacyLink")}
            </a>
          );
        }

        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

// The two documents, one after the other, for the bottom of a page.
export function LegalLinks() {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("legal.nav")}
      className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400"
    >
      <a href={TERMS_PATH} className={LINK}>
        {t("legal.terms")}
      </a>
      <a href={PRIVACY_PATH} className={LINK}>
        {t("legal.privacy")}
      </a>
      <a href={ABOUT_PATH} className={LINK}>
        {t("about.link")}
      </a>
    </nav>
  );
}
