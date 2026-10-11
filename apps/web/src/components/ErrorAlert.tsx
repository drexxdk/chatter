import { useTranslation } from "react-i18next";

import { Notice } from "./Notice";

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
    <Notice role="alert" tone="error">
      {t(`errors.${code}`, { defaultValue: t("errors.unknown"), ...values })}
    </Notice>
  );
}
