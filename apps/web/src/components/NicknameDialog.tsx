import { ArrowRight, LogIn, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import { normalizeNickname } from "../nickname";
import { loadTermsAccepted, saveTermsAccepted } from "../preferences";
import { readAge } from "../profile";
import { AccountOptions } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Modal } from "./Modal";
import {
  AvatarPicker,
  NameAndAge,
  PicturePicker,
  VisibleNote,
} from "./ProfileFields";
import { TermsCheckbox } from "./TermsCheckbox";

interface NicknameDialogProps {
  connecting: boolean;
  signingIn: boolean;
  error: string | null;
  onSubmit: (
    nickname: string,
    avatar: Avatar,
    picture: string,
    age?: number,
  ) => void;
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
  // Somebody who does not choose gets one at random.
  const [picture, setPicture] = useState(() => randomPicture());
  const [ageText, setAgeText] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  // The box is ticked for a browser that has accepted this version of the terms; null until the guest touches it.
  const rememberedTerms = loadTermsAccepted(termsVersion);
  const [termsChoice, setTermsChoice] = useState<boolean | null>(null);
  const termsAccepted = termsChoice ?? rememberedTerms;

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
      onSubmit(nickname, avatar, picture, age.age);
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
            <PicturePicker
              value={picture}
              onChange={setPicture}
              name="nickname-picture"
            />
            <AvatarPicker value={avatar} onChange={setAvatar} />
            <VisibleNote />
            <TermsCheckbox
              checked={termsAccepted}
              onChange={setTermsChoice}
              invalid={touched && !termsAccepted}
            />
          </>
        )}

        <ErrorAlert code={error} />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" icon={X} onClick={onCancel}>
            {t("nickname.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={moderator ? LogIn : ArrowRight}
            disabled={busy}
          >
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
