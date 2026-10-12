import { useTranslation } from "react-i18next";

import { AVATARS, type Avatar } from "../chat/avatar";
import { MAX_AGE, MIN_AGE } from "../profile";
import { AvatarIcon } from "./Avatar";
import { Field } from "./Field";

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
      <div className="grid grid-cols-2 gap-2">
        {AVATARS.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-indigo-400 ${
              value === option
                ? "border-indigo-400 bg-indigo-500/10"
                : "border-neutral-700"
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

// The nickname and the optional age side by side, with what each is described by under the two. `invalidAge` is for a
// box that was filled in with something that is not an age.
export function NameAndAge({
  nicknameId,
  ageId,
  nickname,
  onNicknameChange,
  invalidNickname,
  age,
  onAgeChange,
  invalidAge,
  autoFocus,
  autoComplete,
}: {
  nicknameId: string;
  ageId: string;
  nickname: string;
  onNicknameChange: (value: string) => void;
  invalidNickname: boolean;
  age: string;
  onAgeChange: (value: string) => void;
  invalidAge: boolean;
  autoFocus?: boolean;
  autoComplete: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <Field
          id={nicknameId}
          label={t("nickname.label")}
          hint={t("nickname.hint")}
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          maxLength={24}
          value={nickname}
          onChange={(event) => onNicknameChange(event.target.value)}
          invalid={invalidNickname}
        />
      </div>
      <div className="w-16 shrink-0">
        <Field
          id={ageId}
          label={t("profile.age")}
          hint={t("profile.ageHint", { min: MIN_AGE, max: MAX_AGE })}
          width="short"
          inputMode="numeric"
          autoComplete="off"
          value={age}
          onChange={(event) =>
            onAgeChange(
              event.target.value
                .replace(/\D/g, "")
                .slice(0, String(MAX_AGE).length),
            )
          }
          invalid={invalidAge}
        />
      </div>
    </div>
  );
}

// What the others in the room get to see of the guest.
export function VisibleNote() {
  const { t } = useTranslation();

  return <p className="text-xs text-neutral-500">{t("profile.visible")}</p>;
}
