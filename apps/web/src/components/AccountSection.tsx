import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Account } from "../account";
import { AccountOptions, providerName } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Notice } from "./Notice";

// What a person can do with their account: a guest can make one by connecting a provider, somebody signed in can sign out
// or delete the account. `returnPath` is where the browser comes back to after signing in.
export function AccountSection({
  account,
  returnPath,
  onSignOut,
  onDelete,
  separated = false,
}: {
  account: Account | null;
  returnPath: string;
  onSignOut: () => void;
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

  if (!account) {
    return (
      <AccountOptions
        returnPath={returnPath}
        intro={t("account.intro")}
        className={line}
      />
    );
  }

  return (
    <section aria-label={t("account.title")} className={`space-y-3 ${line}`}>
      <p className="text-sm text-neutral-300">
        {t("account.signedInWith", {
          provider: providerName(account.provider),
        })}
      </p>

      {confirming ? (
        <div className="space-y-2">
          <Notice tone="warning">{t("account.deleteWarning")}</Notice>
          <ErrorAlert code={error} />
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("account.deleteConfirm")}
            </Button>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              {t("nickname.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSignOut}>{t("account.signOut")}</Button>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            {t("account.delete")}
          </Button>
        </div>
      )}
    </section>
  );
}
