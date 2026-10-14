import { useState } from "react";
import { Shuffle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AVATARS, type Avatar } from "../chat/avatar";
import { randomPictures } from "../chat/picture";
import { MAX_AGE, MIN_AGE } from "../profile";
import { AvatarIcon } from "./Avatar";
import { Button } from "./Button";
import { Field } from "./Field";

const PICTURE_CHOICES = 8;

// The picture to be shown by, as one choice among a few made at random; the one now chosen stays first, and the button
// brings new ones. There is always one chosen, so what is asked for here is never left out. `name` keeps two groups on
// a page apart.
export function PicturePicker({
  value,
  onChange,
  name = "picture",
}: {
  value: string;
  onChange: (picture: string) => void;
  name?: string;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState(() => [
    value,
    ...randomPictures(PICTURE_CHOICES - 1),
  ]);
  const shown = options.includes(value) ? options : [value, ...options];

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("picture.legend")}</legend>
      <div className="grid grid-cols-4 gap-1">
        {shown.map((option, index) => (
          <label
            key={option}
            className={`flex aspect-square cursor-pointer items-center justify-center rounded-full p-1 focus-within:ring-2 focus-within:ring-indigo-400 ${
              value === option
                ? "bg-indigo-500/10 ring-2 ring-indigo-400"
                : "hover:bg-neutral-800"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              aria-label={t("picture.option", { number: index + 1 })}
              className="sr-only"
            />
            <AvatarIcon avatar="other" picture={option} fill />
          </label>
        ))}
      </div>
      <Button
        variant="inline"
        onClick={() =>
          setOptions([value, ...randomPictures(PICTURE_CHOICES - 1)])
        }
      >
        <Shuffle aria-hidden="true" className="mr-1 inline h-4 w-4" />
        {t("picture.shuffle")}
      </Button>
    </fieldset>
  );
}

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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
        {AVATARS.map((option) => (
          <label
            key={option}
            className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-indigo-400 ${
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
  nicknameLabel,
  nicknameHint,
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
  // For an account's display name, which is not called a nickname.
  nicknameLabel?: string;
  nicknameHint?: string;
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
          label={nicknameLabel ?? t("nickname.label")}
          hint={nicknameHint ?? t("nickname.hint")}
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
