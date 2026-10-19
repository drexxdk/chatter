import { KeyRound, Trash2, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import type { PasswordClaim } from "../api";
import { normalizeUsername } from "../nickname";
import { AccountOptions } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Notice } from "./Notice";
import { Field } from "./Field";
import { Modal } from "./Modal";

export function AccountSection({
  onDelete,
  separated = false,
}: {
  // Fails with a code to show (see `errors.*`).
  onDelete: () => Promise<void>;
  // A line above it, for when it follows other things in a dialog.
  separated?: boolean;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const line = separated ? "border-t border-neutral-800 pt-4" : "";

  async function confirmDelete() {
    setDeleting(true);
    setError(null);

    try {
      await onDelete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "connection");
      setDeleting(false);
    }
  }

  return (
    <section aria-label={t("account.title")} className={`space-y-3 ${line}`}>
      {confirming ? (
        <div className="space-y-2">
          <Notice tone="warning">{t("account.deleteWarning")}</Notice>
          <ErrorAlert code={error} />
          <div className="flex gap-2">
            <Button
              variant="primary"
              icon={Trash2}
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("account.deleteConfirm")}
            </Button>
            <Button
              variant="ghost"
              icon={X}
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              {t("nickname.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            icon={Trash2}
            onClick={() => setConfirming(true)}
          >
            {t("account.delete")}
          </Button>
        </div>
      )}
    </section>
  );
}

export function CreateAccountDialog({
  nickname,
  returnPath,
  onClaim,
  onClose,
}: {
  nickname: string;
  returnPath: string;
  onClaim: (input: PasswordClaim) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal title={t("account.claimTitle")} onClose={onClose} closable>
      <AccountOptions returnPath={returnPath} divider={t("account.or")} />
      <ClaimForm nickname={nickname} onClaim={onClaim} />
    </Modal>
  );
}

function ClaimForm({
  nickname,
  onClaim,
}: {
  nickname: string;
  onClaim: (input: PasswordClaim) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(() => nickname.replace(/\s+/g, ""));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    const name = normalizeUsername(username);
    if (!name) return setError("invalid_username");
    if (password.length < 12 || password.length > 128)
      return setError("invalid_password");
    if (password !== confirmation) return setError("password_mismatch");
    setSaving(true);
    setError(null);
    try {
      await onClaim({ username: name, password, confirmation });
      setPassword("");
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "connection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        id="claim-username"
        label={t("account.register.username")}
        autoComplete="username"
        required
        maxLength={24}
        placeholder={username}
        onChange={(event) => setUsername(event.target.value)}
        disabled={saving}
      />
      <Field
        id="claim-password"
        label={t("nickname.password")}
        hint={t("account.passwordHint")}
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={saving}
      />
      <Field
        id="claim-confirmation"
        label={t("account.confirmPassword")}
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={saving}
      />
      <ErrorAlert code={error} />
      <Button type="submit" variant="primary" icon={KeyRound} disabled={saving}>
        {t(saving ? "account.register.submitting" : "account.claimTitle")}
      </Button>
    </form>
  );
}
