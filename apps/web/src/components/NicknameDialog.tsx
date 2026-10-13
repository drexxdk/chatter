import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { normalizeNickname } from "../nickname";
import { loadTermsAccepted, saveTermsAccepted } from "../preferences";
import { readAge } from "../profile";
import { AccountOptions } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { LegalSentence } from "./LegalLinks";
import { Modal } from "./Modal";
import { AvatarPicker, NameAndAge, VisibleNote } from "./ProfileFields";

interface NicknameDialogProps {
  connecting: boolean;
  signingIn: boolean;
  error: string | null;
  onSubmit: (nickname: string, avatar: Avatar, age?: number) => void;
  onSignIn: (email: string, password: string) => void;
  // Called when the guest switches between the two forms, so an error about one is not shown on the other.
  onModeChange: () => void;
  onCancel: () => void;
  // The version of the terms the chat-server names now; null while it is not known.
  termsVersion: string | null;
  // Where the browser comes back to after signing in with a provider: the room that was being joined.
  returnPath: string;
}

export function NicknameDialog({
  connecting,
  signingIn,
  error,
  onSubmit,
  onSignIn,
  onModeChange,
  onCancel,
  termsVersion,
  returnPath,
}: NicknameDialogProps) {
  const { t } = useTranslation();
  const [moderator, setModerator] = useState(false);
  const [value, setValue] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(PLAIN_AVATAR);
  const [ageText, setAgeText] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  // A browser that has accepted this version of the terms is only reminded of them; any other is asked.
  const rememberedTerms = loadTermsAccepted(termsVersion);
  const [termsTicked, setTermsTicked] = useState(false);
  const termsAccepted = rememberedTerms || termsTicked;

  const nickname = normalizeNickname(value);
  const age = readAge(ageText);
  const busy = connecting || signingIn;
  const showInvalid = touched && (moderator ? !email || !password : !nickname);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);

    if (moderator) {
      if (email && password) onSignIn(email.trim(), password);
    } else if (nickname && age.ok && termsAccepted) {
      if (!rememberedTerms) saveTermsAccepted(termsVersion);
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
    <Modal
      onClose={onCancel}
      title={moderator ? t("nickname.moderatorTitle") : t("nickname.title")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {moderator ? (
          <div className="space-y-3">
            <Field
              id="email"
              label={t("nickname.email")}
              type="email"
              required
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              invalid={showInvalid && !email}
            />
            <Field
              id="password"
              label={t("nickname.password")}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={showInvalid && !password}
            />
          </div>
        ) : (
          <>
            <NameAndAge
              nicknameId="nickname"
              ageId="age"
              nickname={value}
              onNicknameChange={setValue}
              invalidNickname={showInvalid}
              age={ageText}
              onAgeChange={setAgeText}
              invalidAge={touched && !age.ok}
              autoFocus
              autoComplete="nickname"
            />
            <AvatarPicker value={avatar} onChange={setAvatar} />
            <VisibleNote />
            {rememberedTerms ? (
              <p className="text-xs text-neutral-400">
                <LegalSentence i18nKey="terms.accepted" />
              </p>
            ) : (
              <div className="space-y-1">
                <label className="flex items-start gap-2 rounded-md bg-neutral-950 p-3 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={termsTicked}
                    onChange={(event) => setTermsTicked(event.target.checked)}
                    aria-invalid={touched && !termsTicked}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500"
                  />
                  <span>
                    <LegalSentence i18nKey="terms.accept" />
                  </span>
                </label>
                {touched && !termsTicked && (
                  <p className="text-sm text-red-300">
                    {t("terms.acceptRequired")}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <ErrorAlert code={error} />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t("nickname.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {moderator
              ? signingIn
                ? t("nickname.signingIn")
                : t("nickname.signIn")
              : connecting
                ? t("nickname.connecting")
                : t("nickname.submit")}
          </Button>
        </div>

        <div className="space-y-3 border-t border-neutral-800 pt-3">
          {!moderator && (
            <AccountOptions
              returnPath={returnPath}
              intro={t("account.orContinue")}
            />
          )}
          <div className="flex justify-center">
            <Button variant="link" onClick={switchMode}>
              {moderator
                ? t("nickname.continueAsGuest")
                : t("nickname.signInAsModerator")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
