import { useTranslation } from "react-i18next";

export function ErrorAlert({ code }: { code: string | null }) {
  const { t } = useTranslation();

  if (!code) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
    >
      {t(`errors.${code}`, { defaultValue: t("errors.unknown") })}
    </p>
  );
}
