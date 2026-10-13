import { LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Account } from "../account";
import { AccountOptions, useAuthProviders } from "./AccountOptions";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ProfileButton } from "./ProfileButton";

// In the header of the lobby: the profile of somebody signed in, or the way to sign in. Nothing when nobody can sign in,
// so a server without providers shows no button that leads nowhere.
export function AccountButton({
  account,
  onClick,
}: {
  account: Account | null;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const providers = useAuthProviders();

  if (account) {
    return (
      <ProfileButton
        nickname={account.nickname}
        avatar={account.avatar}
        picture={account.picture}
        onClick={onClick}
      />
    );
  }

  if (providers.length === 0) return null;

  return (
    <Button variant="ghost" icon={LogIn} onClick={onClick}>
      {t("account.open")}
    </Button>
  );
}

// The way to sign in with a provider, for a guest outside a room; somebody signed in has their profile instead.
export function AccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t("account.title")} closable>
      <AccountOptions returnPath="/" intro={t("account.intro")} />
    </Modal>
  );
}
