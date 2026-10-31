import { Check, KeyRound, Pencil, Save, Trash2, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { changeAccountPassword, type PasswordClaim } from "../api";
import type { Account } from "../account";
import { passwordChecks } from "../../../../shared/chatProtocol.mjs";
import { normalizeUsername } from "../nickname";
import { isTouchScreen } from "../touch";
import { AccountOptions } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Notice } from "./Notice";
import { Field } from "./Field";
import { Modal, useModalViewTransition } from "./Modal";
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
  const changeView = useModalViewTransition();
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
            changeView(() => {
              setChangingPassword(false);
              onActionChange?.(false);
            });
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
          <div className="modal-actions flex flex-wrap justify-end gap-2">
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
              loading={deleting}
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
                changeView(() => {
                  setPasswordResult(undefined);
                  setChangingPassword(true);
                  onActionChange?.(true);
                });
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
  const [submitted, setSubmitted] = useState(false);

  const currentPasswordInvalid = hasPassword && !currentPassword;
  const passwordInvalid = !Object.values(passwordChecks(password)).every(
    Boolean,
  );
  const confirmationInvalid = !confirmation || password !== confirmation;
  const currentPasswordError = error === "invalid_current_password";
  const passwordError = error === "invalid_password";
  const confirmationError = error === "password_mismatch";

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setError(null);
    if (currentPasswordInvalid || passwordInvalid || confirmationInvalid)
      return;
    setSaving(true);
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
      setSaving(false);
    }
  }

  return (
    <form
      id="change-password-form"
      method="post"
      noValidate
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
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            if (currentPasswordError) setError(null);
          }}
          error={
            (submitted && currentPasswordInvalid) || currentPasswordError
              ? t("errors.invalid_current_password")
              : undefined
          }
          disabled={saving}
        />
      )}
      <Field
        id="change-new-password"
        name="new-password"
        label={t("account.newPassword")}
        aria-describedby="change-new-password-hint"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (passwordError || confirmationError) setError(null);
        }}
        invalid={(submitted && passwordInvalid) || passwordError}
        disabled={saving}
      >
        <PasswordStrength
          id="change-new-password-hint"
          password={password}
          invalid={(submitted && passwordInvalid) || passwordError}
        />
      </Field>
      <Field
        id="change-confirmation"
        name="confirm-password"
        label={t("account.confirmPassword")}
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={confirmation}
        onChange={(event) => {
          setConfirmation(event.target.value);
          if (confirmationError) setError(null);
        }}
        error={
          (submitted && confirmationInvalid) || confirmationError
            ? t("errors.password_mismatch")
            : undefined
        }
        disabled={saving}
      />
      <ErrorAlert
        code={
          currentPasswordError || passwordError || confirmationError
            ? null
            : error
        }
      />
      <div className="modal-actions flex flex-wrap justify-end gap-2">
        <Button icon={X} variant="ghost" disabled={saving} onClick={onCancel}>
          {t("nickname.cancel")}
        </Button>
        <Button type="submit" icon={Save} variant="primary" loading={saving}>
          {t("profile.save")}
        </Button>
      </div>
    </form>
  );
}

function PasswordStrength({
  password,
  id,
  invalid,
}: {
  password: string;
  id: string;
  invalid: boolean;
}) {
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
    <div id={id} role={invalid ? "alert" : undefined} className="space-y-2">
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
              className={`flex items-center gap-1.5 ${passed ? "text-green-400" : invalid ? "text-red-300" : "text-neutral-400"}`}
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
      <CreateAccountForm
        nickname={nickname}
        returnPath={returnPath}
        onClaim={onClaim}
      />
    </Modal>
  );
}

export function CreateAccountForm({
  nickname,
  returnPath,
  onClaim,
}: {
  nickname: string;
  returnPath: string;
  onClaim: (input: PasswordClaim) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <AccountOptions returnPath={returnPath} divider={t("account.or")} />
      <ClaimForm nickname={nickname} onClaim={onClaim} />
    </div>
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
  const [submitted, setSubmitted] = useState(false);

  const name = normalizeUsername(username);
  const passwordInvalid = !Object.values(passwordChecks(password)).every(
    Boolean,
  );
  const confirmationInvalid = !confirmation || password !== confirmation;
  const usernameError =
    error === "invalid_username" || error === "reserved_username";
  const passwordError = error === "invalid_password";
  const confirmationError = error === "password_mismatch";

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving || humanToken === null) return;
    setSubmitted(true);
    setError(null);
    if (!name || passwordInvalid || confirmationInvalid) return;
    setSaving(true);
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
      setSaving(false);
    }
  }

  return (
    <form
      id="claim-account-form"
      method="post"
      noValidate
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
        onChange={(event) => {
          setUsername(event.target.value);
          if (usernameError) setError(null);
        }}
        error={
          usernameError
            ? t(`errors.${error}`)
            : submitted && !name
              ? t(
                  username.trim()
                    ? "errors.invalid_username"
                    : "errors.field_required",
                )
              : undefined
        }
        disabled={saving}
      />
      <Field
        id="claim-password"
        name="password"
        autoFocus={!isTouchScreen()}
        data-autofocus
        label={t("nickname.password")}
        aria-describedby="claim-password-hint"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (passwordError || confirmationError) setError(null);
        }}
        invalid={(submitted && passwordInvalid) || passwordError}
        disabled={saving}
      >
        <PasswordStrength
          id="claim-password-hint"
          password={password}
          invalid={(submitted && passwordInvalid) || passwordError}
        />
      </Field>
      <Field
        id="claim-confirmation"
        name="confirm-password"
        label={t("account.confirmPassword")}
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={confirmation}
        onChange={(event) => {
          setConfirmation(event.target.value);
          if (confirmationError) setError(null);
        }}
        error={
          (submitted && confirmationInvalid) || confirmationError
            ? t("errors.password_mismatch")
            : undefined
        }
        disabled={saving}
      />
      <HumanCheck
        action="account_claim"
        onToken={setHumanToken}
        busy={saving}
      />
      <ErrorAlert
        code={
          usernameError || passwordError || confirmationError ? null : error
        }
      />
      <div className="modal-actions">
        <Button
          type="submit"
          variant="primary"
          icon={KeyRound}
          loading={saving}
          disabled={humanToken === null}
          className="w-full"
        >
          {t("account.claimTitle")}
        </Button>
      </div>
    </form>
  );
}
