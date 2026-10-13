import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import type { ActionResult, Session } from "../chat/useChat";
import type { Account } from "../account";
import { normalizeNickname } from "../nickname";
import { MAX_AGE, MIN_AGE, readAge, type ProfileChanges } from "../profile";
import { AccountSection } from "./AccountSection";
import { AvatarIcon } from "./Avatar";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Modal } from "./Modal";
import {
  AvatarPicker,
  NameAndAge,
  PicturePicker,
  VisibleNote,
} from "./ProfileFields";

// What the guest says about themselves, in a modal on top of the chat. A guest can change all of it; a moderator's name
// belongs to their account, so theirs is only shown.
export function ProfileDialog({
  open,
  onClose,
  session,
  onSave,
  account,
  returnPath,
  onSignOut,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  // Who is signed in, or null for a guest, who can make an account by connecting a provider.
  account: Account | null;
  // Where the browser comes back to after signing in with a provider.
  returnPath: string;
  onSignOut: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t("profile.title")} closable>
      {session.role === "moderator" ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-bold text-green-400">
            <AvatarIcon
              avatar={session.avatar ?? PLAIN_AVATAR}
              picture={session.picture}
            />
            {session.nickname}
          </p>
          <p className="text-sm text-neutral-300">
            {t("profile.moderatorNote")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <ProfileForm session={session} onSave={onSave} onClose={onClose} />
          <AccountSection
            account={account}
            returnPath={returnPath}
            onSignOut={onSignOut}
            onDelete={onDelete}
            separated
          />
        </div>
      )}
    </Modal>
  );
}

// Starts from who the guest is when the modal opens; it is only mounted while the modal is open.
function ProfileForm({
  session,
  onSave,
  onClose,
}: {
  session: Session;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // An account's name is a display name; a guest's is a nickname.
  const account = session.role === "member";
  const [name, setName] = useState(session.nickname);
  const [picture, setPicture] = useState(
    () => session.picture ?? randomPicture(),
  );
  const [avatar, setAvatar] = useState<Avatar>(session.avatar ?? PLAIN_AVATAR);
  const [ageText, setAgeText] = useState(
    session.age === undefined ? "" : String(session.age),
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ActionResult & { ok: false }>();

  const nickname = normalizeNickname(name);
  const age = readAge(ageText);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);

    if (!nickname || !age.ok) return;

    const changes: ProfileChanges = {
      ...(nickname === session.nickname ? {} : { nickname }),
      ...(picture !== session.picture ? { picture } : {}),
      ...(avatar === (session.avatar ?? PLAIN_AVATAR) ? {} : { avatar }),
      ...(age.age === session.age ? {} : { age: age.age ?? null }),
    };

    if (Object.keys(changes).length === 0) return onClose();

    setSaving(true);
    const result = await onSave(changes);
    setSaving(false);

    if (result.ok) onClose();
    else setFailure(result);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <NameAndAge
        nicknameId="profile-nickname"
        ageId="profile-age"
        nickname={name}
        onNicknameChange={setName}
        invalidNickname={touched && !nickname}
        nicknameLabel={account ? t("account.register.displayName") : undefined}
        nicknameHint={
          account ? t("account.register.displayNameHint") : undefined
        }
        age={ageText}
        onAgeChange={setAgeText}
        invalidAge={touched && !age.ok}
        autoComplete="off"
      />

      <PicturePicker
        value={picture}
        onChange={setPicture}
        name="profile-picture"
      />
      <AvatarPicker value={avatar} onChange={setAvatar} name="profile-avatar" />
      <VisibleNote />

      <ErrorAlert
        code={
          failure
            ? failure.error === "rate_limited"
              ? "profile_rate_limited"
              : failure.error
            : null
        }
        values={{
          seconds: failure?.retryAfterSeconds,
          min: MIN_AGE,
          max: MAX_AGE,
        }}
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("nickname.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t("profile.saving") : t("profile.save")}
        </Button>
      </div>
    </form>
  );
}
