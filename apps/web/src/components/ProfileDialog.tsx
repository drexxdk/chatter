import { Pencil, Save, UserPlus, X } from "lucide-react";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import type { Account } from "../account";
import { AVATARS, PLAIN_AVATAR } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import type { ActionResult, Session } from "../chat/types";
import { useRetryCountdown } from "../chat/useRetryCountdown";
import { normalizeNickname } from "../nickname";
import {
  MAX_AGE,
  MIN_AGE,
  readBirthDate,
  type ProfileChanges,
} from "../profile";
import { ProviderLabel } from "./AccountOptions";
import { AccountSection } from "./AccountSection";
import { AvatarIcon, GenderLabel } from "./Avatar";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Modal } from "./Modal";
import { AvatarPicker, NameAndBirthDate, PicturePicker } from "./ProfileFields";
import { useReloadUiContext } from "../reloadUi";
import { useTabText, writeTabDraft } from "../tabDraft";

// Who somebody is shown as: a guest or an account in a room, or an account in the lobby.
export type ProfileSubject = Pick<
  Session,
  "role" | "nickname" | "avatar" | "picture" | "age" | "birthDate"
>;

// Who you are, in a modal on top of the page, the same in the lobby and in a room: what is shown of you, who you are
// signed in through, and a button that turns it into a form to change it. A moderator's name belongs to their account,
// so theirs is only shown.
export function ProfileDialog({
  open,
  onClose,
  profile,
  onSave,
  account,
  onDelete,
  onCreateAccount,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileSubject;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  // Who is signed in, or null for a guest, who can make an account by connecting a provider.
  account: Account | null;
  onDelete: () => Promise<void>;
  onCreateAccount?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t("profile.title")} closable>
      <ProfileBody
        profile={profile}
        onSave={onSave}
        account={account}
        onDelete={onDelete}
        onCreateAccount={onCreateAccount}
      />
    </Modal>
  );
}

// Starts as the profile and goes back to it; it is only mounted while the modal is open.
function ProfileBody({
  profile,
  onSave,
  account,
  onDelete,
  onCreateAccount,
}: {
  profile: ProfileSubject;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  account: Account | null;
  onDelete: () => Promise<void>;
  onCreateAccount?: () => void;
}) {
  const ui = useReloadUiContext();
  const [localEditing, setLocalEditing] = useState(false);
  const editing =
    profile.role !== "moderator" &&
    (ui ? ui.dialog === "profile-edit" : localEditing);
  const setEditing = (value: boolean) => {
    if (ui) ui.setDialog(value ? "profile-edit" : "profile");
    else setLocalEditing(value);
  };

  if (editing) {
    return (
      <ProfileForm
        profile={profile}
        onSave={onSave}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ProfileSummary
        profile={profile}
        account={account}
        onEdit={() => setEditing(true)}
        onCreateAccount={onCreateAccount}
      />
      {profile.role === "member" && account && (
        <AccountSection account={account} onDelete={onDelete} separated />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-neutral-400">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function ProfileSummary({
  profile,
  account,
  onEdit,
  onCreateAccount,
}: {
  profile: ProfileSubject;
  account: Account | null;
  onEdit: () => void;
  onCreateAccount?: () => void;
}) {
  const { t } = useTranslation();
  const moderator = profile.role === "moderator";
  const username = profile.role === "member" ? account?.username : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AvatarIcon
          avatar={profile.avatar ?? PLAIN_AVATAR}
          picture={profile.picture}
          large
        />
        <div className="min-w-0">
          <p
            className={`text-lg font-bold wrap-break-word ${moderator ? "text-green-400" : ""}`}
          >
            {profile.nickname}
          </p>
          {profile.role === "guest" && (
            <p className="text-xs text-neutral-400">{t("account.guest")}</p>
          )}
        </div>
      </div>

      {moderator ? (
        <p className="text-sm text-neutral-300">{t("profile.moderatorNote")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {username && (
              <Detail label={t("account.register.username")}>{username}</Detail>
            )}
            <Detail label={t("profile.gender")}>
              <GenderLabel avatar={profile.avatar ?? PLAIN_AVATAR} />
            </Detail>
            <Detail label={t("profile.age")}>
              {profile.age === undefined
                ? t("profile.notGiven")
                : t("profile.years", { count: profile.age })}
            </Detail>
            {account && (
              <Detail label={t("profile.signedInWith")}>
                <ProviderLabel provider={account.provider} />
              </Detail>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button icon={Pencil} onClick={onEdit}>
              {t("profile.edit")}
            </Button>
            {profile.role === "guest" && onCreateAccount && (
              <Button icon={UserPlus} onClick={onCreateAccount}>
                {t("account.claimTitle")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProfileForm({
  profile,
  onSave,
  onDone,
}: {
  profile: ProfileSubject;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  // An account's name is a display name; a guest's is a nickname.
  const account = profile.role === "member";
  const draftKey = `profile:${profile.role}:${profile.nickname}`;
  const [name, setName] = useTabText(`${draftKey}:name`, profile.nickname);
  const [initialPicture] = useState(() => profile.picture ?? randomPicture());
  const [picture, setPicture] = useTabText(
    `${draftKey}:picture`,
    initialPicture,
  );
  const [avatarText, setAvatar] = useTabText(
    `${draftKey}:avatar`,
    profile.avatar ?? PLAIN_AVATAR,
  );
  const avatar = AVATARS.find((value) => value === avatarText) ?? PLAIN_AVATAR;
  const [birthDateText, setBirthDateText] = useTabText(
    `${draftKey}:birthDate`,
    profile.birthDate ?? "",
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ActionResult & { ok: false }>();
  useRetryCountdown(failure, setFailure);

  const nickname = normalizeNickname(name);
  const birthDate = readBirthDate(birthDateText);

  function finish() {
    for (const field of ["name", "picture", "avatar", "age", "birthDate"])
      writeTabDraft(`${draftKey}:${field}`, undefined);
    onDone();
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);

    if (!nickname || !birthDate.ok) return;

    const changes: ProfileChanges = {
      ...(nickname === profile.nickname ? {} : { nickname }),
      ...(picture !== profile.picture ? { picture } : {}),
      ...(avatar === (profile.avatar ?? PLAIN_AVATAR) ? {} : { avatar }),
      ...(birthDate.birthDate === profile.birthDate
        ? {}
        : { birthDate: birthDate.birthDate ?? null }),
    };

    if (Object.keys(changes).length === 0) return finish();

    setSaving(true);
    const result = await onSave(changes);
    setSaving(false);

    if (result.ok) finish();
    else setFailure(result);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <NameAndBirthDate
        nicknameId="profile-nickname"
        ageId="profile-age"
        nickname={name}
        onNicknameChange={setName}
        invalidNickname={touched && !nickname}
        nicknameLabel={account ? t("account.register.displayName") : undefined}
        nicknameHint={
          account ? t("account.register.displayNameHint") : undefined
        }
        birthDate={birthDateText}
        onBirthDateChange={setBirthDateText}
        invalidAge={touched && !birthDate.ok}
        autoComplete="off"
      />

      <PicturePicker
        value={picture}
        onChange={setPicture}
        name="profile-picture"
      />
      <AvatarPicker value={avatar} onChange={setAvatar} name="profile-avatar" />

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
        <Button variant="ghost" icon={X} onClick={finish}>
          {t("nickname.cancel")}
        </Button>
        <Button type="submit" variant="primary" icon={Save} disabled={saving}>
          {saving ? t("profile.saving") : t("profile.save")}
        </Button>
      </div>
    </form>
  );
}
