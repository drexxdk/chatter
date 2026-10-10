import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { normalizeNickname } from "../nickname";
import { readAge } from "../profile";
import { ErrorAlert } from "./ErrorAlert";
import { AgeField, AvatarPicker } from "./ProfileFields";

interface NicknameDialogProps {
  connecting: boolean;
  signingIn: boolean;
  error: string | null;
  onSubmit: (nickname: string, avatar: Avatar, age?: number) => void;
  onSignIn: (email: string, password: string) => void;
  // Called when the guest switches between the two forms, so an error about one is not shown on the other.
  onModeChange: () => void;
  onCancel: () => void;
}

export function NicknameDialog({
  connecting,
  signingIn,
  error,
  onSubmit,
  onSignIn,
  onModeChange,
  onCancel,
}: NicknameDialogProps) {
  const { t } = useTranslation();
  const [moderator, setModerator] = useState(false);
  const [value, setValue] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(PLAIN_AVATAR);
  const [ageText, setAgeText] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);

  const nickname = normalizeNickname(value);
  const age = readAge(ageText);
  const busy = connecting || signingIn;
  const showInvalid = touched && (moderator ? !email || !password : !nickname);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);

    if (moderator) {
      if (email && password) onSignIn(email.trim(), password);
    } else if (nickname && age.ok) {
      onSubmit(nickname, avatar, age.age);
    }
  }

  function switchMode() {
    setModerator((current) => !current);
    setTouched(false);
    setPassword("");
    onModeChange();
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-title"
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-5"
      >
        <h2 id="nickname-title" className="text-lg font-semibold">
          {moderator ? t("nickname.moderatorTitle") : t("nickname.title")}
        </h2>

        {moderator ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium">
                {t("nickname.email")}
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={showInvalid && !email}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium">
                {t("nickname.password")}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={showInvalid && !password}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="nickname" className="block text-sm font-medium">
                {t("nickname.label")}
              </label>
              <input
                id="nickname"
                autoFocus
                autoComplete="nickname"
                maxLength={24}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-invalid={showInvalid}
                aria-describedby="nickname-hint"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <p
                id="nickname-hint"
                className={
                  showInvalid
                    ? "text-sm text-red-300"
                    : "text-sm text-slate-500"
                }
              >
                {t("nickname.hint")}
              </p>
            </div>
            <AvatarPicker value={avatar} onChange={setAvatar} />
            <AgeField
              id="age"
              value={ageText}
              onChange={setAgeText}
              invalid={touched && !age.ok}
            />
          </>
        )}

        <ErrorAlert code={error} />

        <button
          type="button"
          onClick={switchMode}
          className="text-sm text-indigo-300 underline hover:text-indigo-200"
        >
          {moderator
            ? t("nickname.continueAsGuest")
            : t("nickname.signInAsModerator")}
        </button>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 hover:bg-slate-800"
          >
            {t("nickname.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500 disabled:opacity-60"
          >
            {moderator
              ? signingIn
                ? t("nickname.signingIn")
                : t("nickname.signIn")
              : connecting
                ? t("nickname.connecting")
                : t("nickname.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
