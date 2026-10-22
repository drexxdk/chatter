import { Check, KeyRound, Trash2, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { changeAccountPassword, type PasswordClaim } from "../api";
import type { Account } from "../account";
import { passwordChecks } from "../../../../shared/chatProtocol.mjs";
import { normalizeUsername } from "../nickname";
import { AccountOptions } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Notice } from "./Notice";
import { Field } from "./Field";
import { Modal } from "./Modal";

export function AccountSection({
  account,
  onDelete,
  separated = false,
}: {
  account?: Account;
  // Fails with a code to show (see `errors.*`).
  onDelete: () => Promise<void>;
  // A line above it, for when it follows other things in a dialog.
  separated?: boolean;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
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
      {account?.provider === "password" &&
        (changingPassword ? (
          <PasswordChangeForm
            account={account}
            onCancel={() => setChangingPassword(false)}
            onDone={() => {
              setChangingPassword(false);
              setPasswordChanged(true);
            }}
          />
        ) : (
          <Button
            icon={KeyRound}
            onClick={() => {
              setPasswordChanged(false);
              setChangingPassword(true);
            }}
          >
            {t("account.changePassword")}
          </Button>
        ))}
      {passwordChanged && (
        <p role="status" className="text-sm text-green-400">
          {t("account.passwordChanged")}
        </p>
      )}
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

function PasswordChangeForm({
  account,
  onCancel,
  onDone,
}: {
  account: Account;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    if (!currentPassword) return setError("invalid_current_password");
    if (!Object.values(passwordChecks(password)).every(Boolean))
      return setError("invalid_password");
    if (password !== confirmation) return setError("password_mismatch");
    setSaving(true);
    setError(null);
    try {
      await changeAccountPassword(account.token, {
        currentPassword,
        password,
        confirmation,
      });
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "connection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      aria-label={t("account.changePassword")}
      onSubmit={submit}
      className="space-y-3"
    >
      <input
        type="hidden"
        name="username"
        autoComplete="username"
        value={account.username ?? account.nickname}
      />
      <Field
        id="change-current-password"
        label={t("account.currentPassword")}
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        disabled={saving}
      />
      <Field
        id="change-new-password"
        label={t("account.newPassword")}
        hint={t("account.passwordHint")}
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={saving}
      />
      <PasswordStrength password={password} />
      <Field
        id="change-confirmation"
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          icon={KeyRound}
          variant="primary"
          disabled={saving}
        >
          {t("account.changePassword")}
        </Button>
        <Button icon={X} variant="ghost" disabled={saving} onClick={onCancel}>
          {t("nickname.cancel")}
        </Button>
      </div>
    </form>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  const checks = passwordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  const ready = score === 4;
  const strength = t(
    ready
      ? "account.passwordReady"
      : score >= 3
        ? "account.passwordFair"
        : "account.passwordWeak",
  );
  const color = !password
    ? "bg-neutral-700"
    : ready
      ? "bg-green-500"
      : score >= 3
        ? "bg-amber-400"
        : "bg-red-400";
  const labels = [
    ["length", "account.passwordLength"],
    ["lowercase", "account.passwordLowercase"],
    ["uppercase", "account.passwordUppercase"],
    ["number", "account.passwordNumber"],
  ] as const;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="text-neutral-400">
          {t("account.passwordStrength")}
        </span>
        {password && (
          <span
            className={
              ready
                ? "text-green-400"
                : score >= 3
                  ? "text-amber-300"
                  : "text-red-300"
            }
          >
            {strength}
          </span>
        )}
      </div>
      <div
        role="meter"
        aria-label={t("account.passwordStrength")}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={strength}
        className="h-1.5 overflow-hidden rounded-full bg-neutral-800"
      >
        <div
          className={`h-full transition-[width] ${color}`}
          style={{ width: `${score * 25}%` }}
        />
      </div>
      <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        {labels.map(([key, label]) => {
          const passed = checks[key];
          const Icon = passed ? Check : X;
          return (
            <li
              key={key}
              className={`flex items-center gap-1.5 ${passed ? "text-green-400" : "text-neutral-400"}`}
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              {t(label)}
            </li>
          );
        })}
      </ul>
    </div>
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
    if (!Object.values(passwordChecks(password)).every(Boolean))
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
        data-autofocus
        label={t("nickname.password")}
        hint={t("account.passwordHint")}
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={saving}
      />
      <PasswordStrength password={password} />
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
