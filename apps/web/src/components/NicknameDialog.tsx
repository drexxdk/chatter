import { ArrowRight } from "lucide-react";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import { normalizeNickname } from "../nickname";
import { saveTermsAccepted } from "../preferences";
import { AccountOptions } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { TermsCheckbox } from "./TermsCheckbox";
import { useTabText } from "../tabDraft";
import { HumanCheck } from "./HumanCheck";

interface NicknameDialogProps {
  // Whether it is shown; it is left in the page while it fades out.
  open: boolean;
  connecting: boolean;
  error: string | null;
  onSubmit: (
    nickname: string,
    avatar: Avatar,
    picture: string,
    humanToken?: string,
  ) => void;
  onCancel: () => void;
  onSignIn?: () => void;
  signInForm?: ReactNode;
  // The version of the terms the chat-server names now; null while it is not known.
  termsVersion: string | null;
  // Where the browser comes back to after signing in with a provider: the room that was being joined.
  returnPath: string;
}

// The two ways in: with an account at a provider, which says who the person is, or as a guest with a nickname. The
// accounts come first, so that nothing is typed that a provider's sign-in would make useless.
export function NicknameDialog({
  open,
  connecting,
  error,
  onSubmit,
  onCancel,
  onSignIn,
  signInForm,
  termsVersion,
  returnPath,
}: NicknameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useTabText(`nickname:${returnPath}`);
  // A guest gets a picture at random, and the plain avatar; both can be changed in the profile once they are in.
  const [picture] = useState(() => randomPicture());
  const [touched, setTouched] = useState(false);
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(open);

  if (previousOpen !== open) {
    setPreviousOpen(open);
    setTermsAccepted(false);
  }

  const nickname = normalizeNickname(value);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);

    if (!connecting && nickname && termsAccepted && humanToken !== null) {
      saveTermsAccepted(termsVersion);
      onSubmit(nickname, PLAIN_AVATAR, picture, humanToken || undefined);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t(signInForm ? "nickname.signIn" : "nickname.title")}
      closable
    >
      {(changeView) =>
        signInForm ?? (
          <div className="space-y-4">
            <AccountOptions
              returnPath={returnPath}
              intro={t("nickname.withAccount")}
              divider={t("nickname.orGuest")}
              onSignIn={onSignIn ? () => changeView(onSignIn) : undefined}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                id="nickname"
                label={t("nickname.label")}
                hint={t("nickname.hint")}
                autoFocus
                data-autofocus
                autoComplete="nickname"
                maxLength={24}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                invalid={touched && !nickname}
              />
              <HumanCheck
                action="guest_join"
                onToken={setHumanToken}
                busy={connecting}
                active={open}
              />
              <TermsCheckbox
                checked={termsAccepted}
                onChange={setTermsAccepted}
                invalid={touched && !termsAccepted}
              />

              <ErrorAlert code={error} />

              <div className="modal-actions">
                <Button
                  type="submit"
                  variant="primary"
                  icon={ArrowRight}
                  disabled={connecting || humanToken === null}
                  className="w-full"
                >
                  {connecting ? t("nickname.connecting") : t("nickname.submit")}
                </Button>
              </div>
            </form>
          </div>
        )
      }
    </Modal>
  );
}
