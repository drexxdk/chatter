import { LogIn } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Modal } from "./Modal";

interface ModeratorDialogProps {
  signingIn: boolean;
  error: string | null;
  onSignIn: (email: string, password: string) => void;
  onCancel: () => void;
}

// The sign-in of the people who look after the chat, which is not part of joining a room.
export function ModeratorDialog({
  signingIn,
  error,
  onSignIn,
  onCancel,
}: ModeratorDialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);

    if (email && password) onSignIn(email.trim(), password);
  }

  return (
    <Modal onClose={onCancel} title={t("nickname.moderatorTitle")} closable>
      <form onSubmit={handleSubmit} className="space-y-4">
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
            invalid={touched && !email}
          />
          <Field
            id="password"
            label={t("nickname.password")}
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={touched && !password}
          />
        </div>

        <ErrorAlert code={error} />

        <Button
          type="submit"
          variant="primary"
          icon={LogIn}
          disabled={signingIn}
          className="w-full"
        >
          {signingIn ? t("nickname.signingIn") : t("nickname.signIn")}
        </Button>
      </form>
    </Modal>
  );
}
