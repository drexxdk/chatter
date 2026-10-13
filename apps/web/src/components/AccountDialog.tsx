import { useTranslation } from "react-i18next";

import type { Account } from "../account";
import { PLAIN_AVATAR } from "../chat/avatar";
import { AccountSection } from "./AccountSection";
import { useAuthProviders } from "./AccountOptions";
import { AvatarIcon } from "./Avatar";
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
    <Button variant="ghost" onClick={onClick}>
      {t("account.open")}
    </Button>
  );
}

// The account outside a room, where there is no profile to change: who is signed in and how to sign out, or the
// providers to sign in with.
export function AccountDialog({
  open,
  onClose,
  account,
  onSignOut,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  account: Account | null;
  onSignOut: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t("account.title")} closable>
      <div className="space-y-3">
        {account && (
          <p className="flex items-center gap-2 font-bold">
            <AvatarIcon
              avatar={account.avatar ?? PLAIN_AVATAR}
              picture={account.picture}
            />
            {account.nickname}
          </p>
        )}
        <AccountSection
          account={account}
          returnPath="/"
          onSignOut={onSignOut}
          onDelete={onDelete}
        />
      </div>
    </Modal>
  );
}
