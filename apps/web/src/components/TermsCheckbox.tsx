import { useTranslation } from "react-i18next";

import { LegalSentence } from "./LegalLinks";

// The box that says the terms are accepted, with what is wrong when it is not.
export function TermsCheckbox({
  checked,
  onChange,
  invalid,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <label
        className={`flex items-start gap-2 rounded-md border bg-neutral-950 p-3 text-sm text-neutral-300 ${invalid ? "border-red-500" : "border-transparent"}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={invalid}
          aria-describedby={invalid ? "terms-accept-error" : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500"
        />
        <span>
          <LegalSentence i18nKey="terms.accept" />
        </span>
      </label>
      {invalid && (
        <p
          id="terms-accept-error"
          role="alert"
          className="text-sm text-red-300"
        >
          {t("terms.acceptRequired")}
        </p>
      )}
    </div>
  );
}
