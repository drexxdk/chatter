import { LogIn } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { AccountOptions } from "./AccountOptions";
import { useTabText } from "../tabDraft";
import { HumanCheck } from "./HumanCheck";

interface ModeratorDialogProps {
  returnPath: string;
  showProviders?: boolean;
  signingIn: boolean;
  error: string | null;
  onSignIn: (email: string, password: string, humanToken?: string) => void;
  onCancel: () => void;
}

export function ModeratorDialog(props: ModeratorDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal onClose={props.onCancel} title={t("nickname.signIn")} closable>
      <ModeratorForm {...props} />
    </Modal>
  );
}

export function ModeratorForm({
  returnPath,
  showProviders = true,
  signingIn,
  error,
  onSignIn,
}: Omit<ModeratorDialogProps, "onCancel">) {
  const { t } = useTranslation();
  const [email, setEmail] = useTabText("signin:identifier");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [humanToken, setHumanToken] = useState<string | null>(null);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);

    if (!signingIn && email && password && humanToken !== null)
      onSignIn(email.trim(), password, humanToken || undefined);
  }

  return (
    <div className="space-y-4">
      {showProviders && (
        <AccountOptions returnPath={returnPath} divider={t("account.or")} />
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3">
          <Field
            id="email"
            label={t("account.identifier")}
            type="text"
            required
            autoFocus
            disabled={signingIn}
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={touched && !email}
          />
          <Field
            id="password"
            label={t("nickname.password")}
            type="password"
            required
            autoComplete="current-password"
            disabled={signingIn}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={touched && !password}
          />
        </div>

        <HumanCheck
          action="password_login"
          onToken={setHumanToken}
          busy={signingIn}
        />
        <ErrorAlert code={error} />

        <Button
          type="submit"
          variant="primary"
          icon={LogIn}
          disabled={signingIn || humanToken === null}
          className="w-full"
        >
          {signingIn ? t("nickname.signingIn") : t("nickname.signIn")}
        </Button>
      </form>
    </div>
  );
}
