import { useTranslation } from "react-i18next";

export function ErrorAlert({
  code,
  values,
}: {
  code: string | null;
  // Fills placeholders in the translation, e.g. the seconds to wait.
  values?: Record<string, unknown>;
}) {
  const { t } = useTranslation();

  if (!code) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
    >
      {t(`errors.${code}`, { defaultValue: t("errors.unknown"), ...values })}
    </p>
  );
}
