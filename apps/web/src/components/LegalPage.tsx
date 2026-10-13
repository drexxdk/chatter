import { ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { CONTACT_EMAIL } from "../config";
import { legalIn, withContact, type LegalPageName } from "../legal";
import { useLegal } from "../legal/useLegal";
import { LOBBY_PATH } from "../place";
import { LegalLinks, LINK } from "./LegalLinks";
import { LoadError, Loading } from "./LoadState";
import { PageFrame } from "./PageFrame";

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

// The terms of use or the privacy policy, in the guest's language, in the same frame as the chat: its header (with the
// menu that sets the language), and a trail back to the lobby. The text is what the admin published.
export function LegalPage({ page }: { page: LegalPageName }) {
  const { t, i18n } = useTranslation();
  const { state, retry } = useLegal();
  const doc =
    state.status === "ready"
      ? legalIn(state.legal, i18n.resolvedLanguage)[page]
      : undefined;
  const contactEmail =
    state.status === "ready" ? state.legal.contactEmail : CONTACT_EMAIL;
  const title = doc?.title ?? t(`legal.${page}`);

  useEffect(() => {
    const before = document.title;
    document.title = `${title} \u2013 ${t("app.title")}`;

    return () => {
      document.title = before;
    };
  }, [title, t]);

  return (
    <PageFrame>
      <nav aria-label={t("legal.breadcrumb")} className="text-sm">
        <ol className="flex flex-wrap items-center gap-1 text-neutral-400">
          <li>
            <a href={LOBBY_PATH} className={LINK}>
              {t("app.title")}
            </a>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-4 w-4" />
          </li>
          <li aria-current="page" className="text-neutral-200">
            {title}
          </li>
        </ol>
      </nav>

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
    </PageFrame>
  );
}
