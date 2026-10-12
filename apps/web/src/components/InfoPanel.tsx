import { useTranslation } from "react-i18next";

import { LegalLinks } from "./LegalLinks";

// What a guest needs to know to use the chat; kept out of the page itself so it does not take room from the messages.
export function InfoPanel({
  slowModeSeconds,
}: {
  slowModeSeconds?: number | null;
}) {
  const { t } = useTranslation();
  const sections = [
    "everyone",
    "private",
    "conversations",
    "blocking",
    "keyboard",
  ] as const;

  return (
    <div className="space-y-4 text-sm text-neutral-300">
      {slowModeSeconds ? (
        <p className="text-amber-300">
          {t("room.slowMode", { seconds: slowModeSeconds })}
        </p>
      ) : null}

      {sections.map((section) => (
        <InfoSection key={section} title={t(`info.${section}Heading`)}>
          {t(`info.${section}`)}
        </InfoSection>
      ))}

      <InfoSection title={t("info.moderatorsHeading")}>
        {t("info.moderators")}
      </InfoSection>

      <LegalLinks />
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: string }) {
  return (
    <section className="space-y-1">
      <h3 className="font-semibold text-neutral-100">{title}</h3>
      <p>{children}</p>
    </section>
  );
}
