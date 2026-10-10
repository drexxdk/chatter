import { useTranslation } from "react-i18next";

import { AVATARS, type Avatar } from "../chat/avatar";
import { MAX_AGE, MIN_AGE } from "../profile";
import { AvatarIcon } from "./Avatar";

// How the guest wants to be shown, as one choice among the avatars. `name` keeps two groups on a page apart.
export function AvatarPicker({
  value,
  onChange,
  name = "avatar",
}: {
  value: Avatar;
  onChange: (avatar: Avatar) => void;
  name?: string;
}) {
  const { t } = useTranslation();

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("avatar.legend")}</legend>
      <div className="flex flex-wrap gap-2">
        {AVATARS.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-indigo-400 ${
              value === option
                ? "border-indigo-400 bg-indigo-500/10"
                : "border-slate-700"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            <AvatarIcon avatar={option} small />
            <span>{t(`avatar.${option}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The optional age. `invalid` is for a box that was filled in with something that is not an age.
export function AgeField({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {t("profile.age")}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        maxLength={3}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint`}
        className="w-24 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
      />
      <p
        id={`${id}-hint`}
        className={invalid ? "text-sm text-red-300" : "text-sm text-slate-500"}
      >
        {t("profile.ageHint", { min: MIN_AGE, max: MAX_AGE })}
      </p>
    </div>
  );
}
