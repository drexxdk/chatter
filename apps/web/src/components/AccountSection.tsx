import { Check, KeyRound, Pencil, Save, Trash2, X } from "lucide-react";
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
import { HumanCheck } from "./HumanCheck";

export function AccountSection({
  account,
  staffToken,
  staffUsername,
  canDelete = true,
  onEdit,
  onDelete,
  separated = false,
  onActionChange,
  onPasswordChanged,
}: {
  account?: Account;
  staffToken?: string;
  staffUsername?: string;
  canDelete?: boolean;
  onEdit?: () => void;
  // Fails with a code to show (see `errors.*`).
  onDelete: () => Promise<void>;
  // A line above it, for when it follows other things in a dialog.
  separated?: boolean;
  onActionChange?: (active: boolean) => void;
  onPasswordChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordResult, setPasswordResult] = useState<"set" | "changed">();
  const [passwordAdded, setPasswordAdded] = useState(false);
  const line = separated ? "border-t border-neutral-800 pt-4" : "";
  const passwordToken = staffToken ?? account?.token;
  const passwordUsername = staffToken ? staffUsername : account?.username;
  const hasPassword = Boolean(
    staffToken ||
    passwordAdded ||
    (account?.hasPassword ?? account?.provider === "password"),
  );

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
      {passwordToken && changingPassword && (
        <PasswordChangeForm
          token={passwordToken}
          username={passwordUsername}
          hasPassword={hasPassword}
          onCancel={() => {
            setChangingPassword(false);
            onActionChange?.(false);
          }}
          onDone={() => {
            setChangingPassword(false);
            setPasswordResult(hasPassword ? "changed" : "set");
            setPasswordAdded(true);
            onPasswordChanged?.();
            onActionChange?.(false);
          }}
        />
      )}
      {passwordResult && (
        <p role="status" className="text-sm text-green-400">
          {t(
            passwordResult === "set"
              ? "account.passwordSet"
              : "account.passwordChanged",
          )}
        </p>
      )}
      {!changingPassword && confirming && canDelete && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("account.delete")}</h3>
          <Notice tone="warning">{t("account.deleteWarning")}</Notice>
          <ErrorAlert code={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              icon={X}
              disabled={deleting}
              onClick={() => {
                setConfirming(false);
                setError(null);
                onActionChange?.(false);
              }}
            >
              {t("nickname.cancel")}
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("account.deleteConfirm")}
            </Button>
          </div>
        </div>
      )}
      {!changingPassword && !confirming && (
        <div className="flex flex-wrap items-center gap-2">
          {onEdit && (
            <Button icon={Pencil} onClick={onEdit}>
              {t("profile.edit")}
            </Button>
          )}
          {passwordToken && (
            <Button
              icon={KeyRound}
              disabled={!passwordUsername}
              onClick={() => {
                setPasswordResult(undefined);
                setChangingPassword(true);
                onActionChange?.(true);
              }}
            >
              {t(hasPassword ? "account.changePassword" : "account.claim")}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                setConfirming(true);
                setPasswordResult(undefined);
                setError(null);
                onActionChange?.(true);
              }}
            >
              {t("account.delete")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function PasswordChangeForm({
  token,
  username,
  hasPassword,
  onCancel,
  onDone,
}: {
  token: string;
  username?: string;
  hasPassword: boolean;
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
    if (hasPassword && !currentPassword)
      return setError("invalid_current_password");
    if (!Object.values(passwordChecks(password)).every(Boolean))
      return setError("invalid_password");
    if (password !== confirmation) return setError("password_mismatch");
    setSaving(true);
    setError(null);
    try {
      await changeAccountPassword(token, {
        ...(hasPassword ? { currentPassword } : {}),
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
      id="change-password-form"
      method="post"
      aria-label={t(hasPassword ? "account.changePassword" : "account.claim")}
      onSubmit={submit}
      className="space-y-3"
    >
      <h3 className="text-sm font-semibold">
        {t(hasPassword ? "account.changePassword" : "account.claim")}
      </h3>
      <div className="sr-only">
        <Field
          id="change-username"
          label={t("account.identifier")}
          type="text"
          name="username"
          autoComplete="username"
          value={username ?? ""}
          readOnly
          tabIndex={-1}
        />
      </div>
      {hasPassword && (
        <Field
          id="change-current-password"
          name="current-password"
          label={t("account.currentPassword")}
          type="password"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          required
          maxLength={128}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          disabled={saving}
        />
      )}
      <Field
        id="change-new-password"
        name="new-password"
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
        name="confirm-password"
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
      <div className="flex flex-wrap justify-end gap-2">
        <Button icon={X} variant="ghost" disabled={saving} onClick={onCancel}>
          {t("nickname.cancel")}
        </Button>
        <Button type="submit" icon={Save} variant="primary" disabled={saving}>
          {t("profile.save")}
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
  const suggestedUsername = nickname.replace(/\s+/g, "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [humanToken, setHumanToken] = useState<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving || humanToken === null) return;
    const name = normalizeUsername(username || suggestedUsername);
    if (!name) return setError("invalid_username");
    if (!Object.values(passwordChecks(password)).every(Boolean))
      return setError("invalid_password");
    if (password !== confirmation) return setError("password_mismatch");
    setSaving(true);
    setError(null);
    try {
      await onClaim({
        username: name,
        password,
        confirmation,
        ...(humanToken ? { humanToken } : {}),
      });
      setPassword("");
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "connection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="claim-account-form"
      method="post"
      onSubmit={submit}
      className="space-y-3"
    >
      <Field
        id="claim-username"
        name="username"
        label={t("account.register.username")}
        autoComplete="username"
        required
        maxLength={24}
        placeholder={suggestedUsername}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        disabled={saving}
      />
      <Field
        id="claim-password"
        name="password"
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
        name="confirm-password"
        label={t("account.confirmPassword")}
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={saving}
      />
      <HumanCheck
        action="account_claim"
        onToken={setHumanToken}
        busy={saving}
      />
      <ErrorAlert code={error} />
      <Button
        type="submit"
        variant="primary"
        icon={KeyRound}
        disabled={saving || humanToken === null}
      >
        {t(saving ? "account.register.submitting" : "account.claimTitle")}
      </Button>
    </form>
  );
}
