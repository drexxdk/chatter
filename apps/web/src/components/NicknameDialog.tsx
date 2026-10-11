import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { normalizeNickname } from "../nickname";
import { readAge } from "../profile";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Modal } from "./Modal";
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

  function handleSubmit(event: SubmitEvent) {
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={showInvalid && !password}
            />
          </div>
        ) : (
          <>
            <Field
              id="nickname"
              label={t("nickname.label")}
              hint={t("nickname.hint")}
              autoFocus
              autoComplete="nickname"
              maxLength={24}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              invalid={showInvalid}
            />
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

        <Button variant="link" onClick={switchMode}>
          {moderator
            ? t("nickname.continueAsGuest")
            : t("nickname.signInAsModerator")}
        </Button>

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
      </form>
    </Modal>
  );
}
