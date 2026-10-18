import { useTranslation } from "react-i18next";

import { Notice } from "./Notice";

export function ErrorAlert({
  code,
  values,
  onDismiss,
}: {
  code: string | null;
  // Fills placeholders in the translation, e.g. the seconds to wait.
  values?: Record<string, unknown>;
  // Adds a button that removes the message.
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();

  if (!code) return null;

  return (
    <Notice
      role="alert"
      tone="error"
      onDismiss={onDismiss}
      dismissLabel={t("notice.dismiss")}
    >
      {t(`errors.${code}`, { defaultValue: t("errors.unknown"), ...values })}
    </Notice>
  );
}
