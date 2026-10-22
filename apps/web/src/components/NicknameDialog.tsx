import { ArrowRight } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import { normalizeNickname } from "../nickname";
import { loadTermsAccepted, saveTermsAccepted } from "../preferences";
import { AccountOptions } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { TermsCheckbox } from "./TermsCheckbox";
import { useTabText } from "../tabDraft";

interface NicknameDialogProps {
  // Whether it is shown; it is left in the page while it fades out.
  open: boolean;
  connecting: boolean;
  error: string | null;
  onSubmit: (nickname: string, avatar: Avatar, picture: string) => void;
  onCancel: () => void;
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
  termsVersion,
  returnPath,
}: NicknameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useTabText(`nickname:${returnPath}`);
  // A guest gets a picture at random, and the plain avatar; both can be changed in the profile once they are in.
  const [picture] = useState(() => randomPicture());
  const [touched, setTouched] = useState(false);
  // The box is ticked for a browser that has accepted this version of the terms; null until the guest touches it.
  const rememberedTerms = loadTermsAccepted(termsVersion);
  const [termsChoice, setTermsChoice] = useState<boolean | null>(null);
  const termsAccepted = termsChoice ?? rememberedTerms;

  const nickname = normalizeNickname(value);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);

    if (nickname && termsAccepted) {
      if (!rememberedTerms) saveTermsAccepted(termsVersion);
      onSubmit(nickname, PLAIN_AVATAR, picture);
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title={t("nickname.title")} closable>
      <div className="space-y-4">
        <AccountOptions
          returnPath={returnPath}
          intro={t("nickname.withAccount")}
          divider={t("nickname.orGuest")}
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
          <TermsCheckbox
            checked={termsAccepted}
            onChange={setTermsChoice}
            invalid={touched && !termsAccepted}
          />

          <ErrorAlert code={error} />

          <Button
            type="submit"
            variant="primary"
            icon={ArrowRight}
            disabled={connecting}
            className="w-full"
          >
            {connecting ? t("nickname.connecting") : t("nickname.submit")}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
