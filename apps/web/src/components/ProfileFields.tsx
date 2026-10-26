import { useState } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Check, ChevronDown, Shuffle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AVATARS, type Avatar } from "../chat/avatar";
import { randomPictures } from "../chat/picture";
import { ageFromBirthDate, MAX_AGE, MIN_AGE } from "../profile";
import { AvatarIcon } from "./Avatar";
import { Button } from "./Button";
import { Field } from "./Field";
import { MENU_ITEM, MENU_SURFACE } from "./dropdown";

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
            className="relative block aspect-square cursor-pointer rounded-full"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              aria-label={t("picture.option", { number: index + 1 })}
              className="peer sr-only"
            />
            <span className="flex aspect-square w-full items-center justify-center rounded-full border border-transparent p-1 peer-checked:border-indigo-400 peer-checked:bg-indigo-500/10 peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-400">
              <AvatarIcon avatar="other" picture={option} fill />
            </span>
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
          <label key={option} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span className="flex h-full min-h-11 items-center gap-2 rounded border border-neutral-700 px-2 py-2 text-sm peer-checked:border-indigo-400 peer-checked:bg-indigo-500/10 peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-400">
              <AvatarIcon avatar={option} small />
              <span>{t(`avatar.${option}`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function NameAndBirthDate({
  nicknameId,
  ageId,
  nickname,
  onNicknameChange,
  invalidNickname,
  nicknameLabel,
  nicknameHint,
  birthDate,
  onBirthDateChange,
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
  birthDate: string;
  onBirthDateChange: (value: string) => void;
  invalidAge: boolean;
  autoFocus?: boolean;
  autoComplete: string;
}) {
  const { t, i18n } = useTranslation();
  const [parts, setParts] = useState(() => {
    const [year = "", month = "", day = ""] = birthDate.split("-");
    return { day, month, year };
  });
  const age = ageFromBirthDate(birthDate);
  const hintId = `${ageId}-hint`;
  const hint = invalidAge
    ? t("profile.birthDateInvalid", { min: MIN_AGE, max: MAX_AGE })
    : age === undefined
      ? t("profile.birthDateHint", { min: MIN_AGE, max: MAX_AGE })
      : t("profile.years", { count: age });
  const monthFormat = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    timeZone: "UTC",
  });
  const controlClass =
    "min-w-0 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2";

  function update(next: typeof parts) {
    setParts(next);
    onBirthDateChange(
      next.day || next.month || next.year
        ? `${next.year}-${next.month}-${next.day ? next.day.padStart(2, "0") : ""}`
        : "",
    );
  }

  return (
    <div className="grid items-start gap-3">
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
      <fieldset
        className="min-w-0 space-y-1"
        aria-describedby={hintId}
        aria-invalid={invalidAge}
      >
        <legend className="text-sm font-medium">
          {t("profile.birthDate")}
        </legend>
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_5rem_auto] items-center gap-2">
          <label className="sr-only" htmlFor={`${ageId}-day`}>
            {t("profile.day")}
          </label>
          <input
            id={`${ageId}-day`}
            aria-describedby={hintId}
            aria-invalid={invalidAge}
            className={controlClass}
            inputMode="numeric"
            autoComplete="bday-day"
            placeholder={t("profile.day")}
            maxLength={2}
            value={parts.day}
            onChange={(event) =>
              update({
                ...parts,
                day: event.target.value.replace(/\D/g, "").slice(0, 2),
              })
            }
          />
          <label className="sr-only" htmlFor={`${ageId}-month`}>
            {t("profile.month")}
          </label>
          <Listbox
            value={parts.month}
            onChange={(month) => update({ ...parts, month })}
            invalid={invalidAge}
          >
            <ListboxButton
              id={`${ageId}-month`}
              aria-label={t("profile.month")}
              aria-describedby={hintId}
              className={`${controlClass} flex items-center justify-between gap-1 text-left`}
            >
              <span className="truncate">
                {parts.month
                  ? monthFormat.format(
                      new Date(Date.UTC(2000, Number(parts.month) - 1, 1)),
                    )
                  : t("profile.month")}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-neutral-400"
              />
            </ListboxButton>
            <ListboxOptions
              anchor={{ to: "bottom start", gap: 4, padding: 8 }}
              modal={false}
              className={`${MENU_SURFACE} z-70 max-h-64 w-(--button-width) min-w-36`}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <ListboxOption
                  key={index}
                  value={String(index + 1).padStart(2, "0")}
                  className={`${MENU_ITEM} group gap-2 px-2 py-1.5`}
                >
                  <span className="flex-1">
                    {monthFormat.format(new Date(Date.UTC(2000, index, 1)))}
                  </span>
                  <Check
                    aria-hidden="true"
                    className="invisible size-4 shrink-0 group-data-selected:visible"
                  />
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Listbox>
          <label className="sr-only" htmlFor={`${ageId}-year`}>
            {t("profile.year")}
          </label>
          <input
            id={`${ageId}-year`}
            aria-describedby={hintId}
            aria-invalid={invalidAge}
            className={controlClass}
            inputMode="numeric"
            autoComplete="bday-year"
            placeholder={t("profile.year")}
            maxLength={4}
            value={parts.year}
            onChange={(event) =>
              update({
                ...parts,
                year: event.target.value.replace(/\D/g, "").slice(0, 4),
              })
            }
          />
          <button
            type="button"
            className="control-icon button-outline"
            title={t("profile.clearBirthDate")}
            aria-label={t("profile.clearBirthDate")}
            disabled={!parts.day && !parts.month && !parts.year}
            onClick={() => update({ day: "", month: "", year: "" })}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <p
          id={hintId}
          className={`text-xs ${invalidAge ? "text-red-300" : "text-neutral-500"}`}
        >
          {hint}
        </p>
      </fieldset>
    </div>
  );
}
