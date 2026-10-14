import { useTranslation } from "react-i18next";

import { CONTACT_EMAIL } from "../config";
import { legalIn, withContact, type LegalPageName } from "../legal";
import type { LegalState } from "../legal/useLegal";
import { Breadcrumb } from "./Breadcrumb";
import { LegalLinks, LINK } from "./LegalLinks";
import { LoadError, Loading } from "./LoadState";

function Paragraph({
  text,
  contactEmail,
}: {
  text: string;
  contactEmail: string;
}) {
  return (
    <p>
      {withContact(text, contactEmail).map((piece, index) =>
        "contact" in piece ? (
          <a key={index} href={`mailto:${contactEmail}`} className={LINK}>
            {piece.contact}
          </a>
        ) : (
          piece.text
        ),
      )}
    </p>
  );
}

// The document in the guest's language, when the text has arrived.
export function legalDocOf(
  state: LegalState,
  language: string | undefined,
  page: LegalPageName,
) {
  return state.status === "ready"
    ? legalIn(state.legal, language)[page]
    : undefined;
}

// The terms of use or the privacy policy, in the guest's language, as a view of the app (under its header, with a trail
// back to the lobby). The text is what the admin published, and `state` is how far fetching it has come.
export function LegalPage({
  page,
  state,
  retry,
}: {
  page: LegalPageName;
  state: LegalState;
  retry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const doc = legalDocOf(state, i18n.resolvedLanguage, page);
  const contactEmail =
    state.status === "ready" ? state.legal.contactEmail : CONTACT_EMAIL;
  const title = doc?.title ?? t(`legal.${page}`);
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb title={title} />

      <article className="space-y-6 text-neutral-200">
        <h1 className="text-2xl font-bold">{title}</h1>

        {state.status === "loading" && <Loading>{t("legal.loading")}</Loading>}

        {state.status === "error" && (
          <LoadError
            message={t("legal.unavailable", { email: contactEmail })}
            retryLabel={t("legal.retry")}
            onRetry={retry}
          />
        )}

        {doc && (
          <>
            <p className="-mt-4 text-sm text-neutral-400">{doc.updated}</p>

            {doc.sections.map((section, index) => (
              <section key={section.heading} className="space-y-2">
                <h2 className="text-lg font-semibold">
                  {index + 1}. {section.heading}
                </h2>
                {section.paragraphs.map((text) => (
                  <Paragraph
                    key={text}
                    text={text}
                    contactEmail={contactEmail}
                  />
                ))}
                {section.items.length > 0 && (
                  <ul className="list-disc space-y-1 pl-6">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </>
        )}
      </article>

      <LegalLinks />
    </div>
  );
}
