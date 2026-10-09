import { useTranslation } from "react-i18next";

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
    <div className="space-y-4 text-sm text-slate-300">
      {slowModeSeconds ? (
        <p className="text-amber-300">
          {t("room.slowMode", { seconds: slowModeSeconds })}
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section} className="space-y-1">
          <h3 className="font-semibold text-slate-100">
            {t(`info.${section}Heading`)}
          </h3>
          <p>{t(`info.${section}`)}</p>
        </section>
      ))}

      <section className="space-y-1">
        <h3 className="font-semibold text-slate-100">
          {t("info.moderatorsHeading")}
        </h3>
        <p>{t("info.moderators")}</p>
      </section>
    </div>
  );
}
