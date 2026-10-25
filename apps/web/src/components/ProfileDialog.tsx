import { Pencil, RotateCw, Save, UserPlus, X } from "lucide-react";
import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import type { Account } from "../account";
import { fetchStaffSession } from "../api";
import { AVATARS, PLAIN_AVATAR } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import type { ActionResult, Session } from "../chat/types";
import { useRetryCountdown } from "../chat/useRetryCountdown";
import { normalizeNickname, normalizeUsername } from "../nickname";
import {
  MAX_AGE,
  MIN_AGE,
  readBirthDate,
  type ProfileChanges,
} from "../profile";
import { ProviderLabel, AccountProviders } from "./AccountOptions";
import { AccountSection } from "./AccountSection";
import { AvatarIcon, GenderLabel } from "./Avatar";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { AvatarPicker, NameAndBirthDate, PicturePicker } from "./ProfileFields";
import { useReloadUiContext } from "../reloadUi";
import { useTabText, writeTabDraft } from "../tabDraft";

// Who somebody is shown as: a guest or an account in a room, or an account in the lobby.
export type ProfileSubject = Pick<
  Session,
  "role" | "admin" | "nickname" | "avatar" | "picture" | "age" | "birthDate"
>;

// Who you are, in a modal on top of the page, the same in the lobby and in a room.
export function ProfileDialog({
  open,
  onClose,
  profile,
  onSave,
  account,
  onDelete,
  onCreateAccount,
  staffToken,
  onPasswordChanged,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileSubject;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  // Who is signed in, or null for a guest, who can make an account by connecting a provider.
  account: Account | null;
  onDelete: () => Promise<void>;
  onCreateAccount?: () => void;
  staffToken?: string;
  onPasswordChanged?: () => void;
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
        staffToken={staffToken}
        onPasswordChanged={onPasswordChanged}
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
  staffToken,
  onPasswordChanged,
}: {
  profile: ProfileSubject;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  account: Account | null;
  onDelete: () => Promise<void>;
  onCreateAccount?: () => void;
  staffToken?: string;
  onPasswordChanged?: () => void;
}) {
  const { t } = useTranslation();
  const ui = useReloadUiContext();
  const [localEditing, setLocalEditing] = useState(false);
  const [accountAction, setAccountAction] = useState(false);
  const [providerAction, setProviderAction] = useState(false);
  const [staffAttempt, setStaffAttempt] = useState(0);
  const [staffResult, setStaffResult] = useState<{
    token: string;
    session?: Awaited<ReturnType<typeof fetchStaffSession>>;
    error?: string;
  }>();
  const staff = staffResult?.token === staffToken ? staffResult : undefined;
  useEffect(() => {
    if (!staffToken) return;
    let cancelled = false;
    void fetchStaffSession(staffToken)
      .then((session) => {
        if (!cancelled)
          setStaffResult({
            token: staffToken,
            session,
            ...(!session.email ? { error: "unavailable" } : {}),
          });
      })
      .catch((cause) => {
        if (!cancelled)
          setStaffResult({
            token: staffToken,
            error: cause instanceof Error ? cause.message : "connection",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [staffToken, staffAttempt]);
  const editing = ui ? ui.dialog === "profile-edit" : localEditing;
  const setEditing = (value: boolean) => {
    if (ui) ui.setDialog(value ? "profile-edit" : "profile");
    else setLocalEditing(value);
  };

  if (editing) {
    return (
      <ProfileForm
        profile={profile}
        username={profile.role === "member" ? account?.username : undefined}
        onSave={onSave}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!accountAction && !providerAction && (
        <ProfileSummary
          profile={profile}
          account={account}
          staffProvider={staff?.session?.provider}
          onEdit={() => setEditing(true)}
          onCreateAccount={onCreateAccount}
        />
      )}
      {!accountAction &&
        (profile.role === "moderator" ? staffToken : account?.token) && (
          <AccountProviders
            token={
              (profile.role === "moderator" ? staffToken : account?.token)!
            }
            onActionChange={setProviderAction}
            separated={!providerAction}
          />
        )}
      {!providerAction && profile.role !== "guest" && (
        <AccountSection
          account={account ?? undefined}
          staffToken={profile.role === "moderator" ? staffToken : undefined}
          staffUsername={staff?.session?.email}
          canDelete={profile.role === "member" && Boolean(account)}
          onEdit={() => setEditing(true)}
          onDelete={onDelete}
          separated={!accountAction}
          onActionChange={setAccountAction}
          onPasswordChanged={onPasswordChanged}
        />
      )}
      {staff?.error && (
        <div className="space-y-2">
          <ErrorAlert code={staff.error} />
          <Button
            icon={RotateCw}
            onClick={() => setStaffAttempt((value) => value + 1)}
          >
            {t("notifications.retry")}
          </Button>
        </div>
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
  staffProvider,
  onEdit,
  onCreateAccount,
}: {
  profile: ProfileSubject;
  account: Account | null;
  staffProvider?: string;
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
          moderator={moderator}
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
          {moderator && (
            <p className="text-xs font-semibold text-green-400">
              {t(profile.admin ? "profile.adminRole" : "room.moderatorBadge")}
            </p>
          )}
        </div>
      </div>

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
        {(moderator || account) && (
          <Detail label={t("profile.signedInWith")}>
            <ProviderLabel
              provider={
                moderator ? (staffProvider ?? "password") : account!.provider
              }
            />
          </Detail>
        )}
      </dl>
      {profile.role === "guest" && (
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
      )}
    </div>
  );
}

function ProfileForm({
  profile,
  username,
  onSave,
  onDone,
}: {
  profile: ProfileSubject;
  username?: string;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  // An account's name is a display name; a guest's is a nickname.
  const account = profile.role !== "guest";
  const draftKey = `profile:${profile.role}:${profile.nickname}`;
  const [usernameText, setUsernameText] = useTabText(
    `${draftKey}:username`,
    username ?? "",
  );
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
  const nextUsername = normalizeUsername(usernameText);
  const birthDate = readBirthDate(birthDateText);

  function finish() {
    for (const field of [
      "username",
      "name",
      "picture",
      "avatar",
      "age",
      "birthDate",
    ])
      writeTabDraft(`${draftKey}:${field}`, undefined);
    onDone();
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget;
    setTouched(true);

    if (username && !nextUsername) {
      form.querySelector<HTMLInputElement>("#profile-username")?.focus();
      return;
    }
    if (!nickname || !birthDate.ok) return;

    const changes: ProfileChanges = {
      ...(username && nextUsername && nextUsername !== username
        ? { username: nextUsername }
        : {}),
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
    else {
      setFailure(result);
      if (result.error === "display_name_cooldown")
        form.querySelector<HTMLInputElement>("#profile-nickname")?.focus();
      else if (
        result.error === "reserved_username" ||
        result.error === "invalid_username"
      )
        form.querySelector<HTMLInputElement>("#profile-username")?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {username && (
        <Field
          id="profile-username"
          label={t("account.register.username")}
          value={usernameText}
          autoComplete="username"
          maxLength={24}
          required
          hint={t("account.register.usernameHint")}
          invalid={
            (touched && !nextUsername) ||
            failure?.error === "reserved_username" ||
            failure?.error === "invalid_username"
          }
          onChange={(event) => {
            setUsernameText(event.target.value.replace(/\s/g, ""));
            if (
              failure?.error === "reserved_username" ||
              failure?.error === "invalid_username"
            )
              setFailure(undefined);
          }}
        />
      )}
      <NameAndBirthDate
        nicknameId="profile-nickname"
        ageId="profile-age"
        nickname={name}
        onNicknameChange={(value) => {
          setName(value);
          if (normalizeNickname(value) === profile.nickname)
            setFailure(undefined);
        }}
        invalidNickname={
          (touched && !nickname) ||
          (failure?.error === "display_name_cooldown" &&
            nickname !== profile.nickname)
        }
        nicknameLabel={account ? t("account.register.displayName") : undefined}
        nicknameHint={
          account
            ? `${t("account.register.displayNameHint")}${profile.role === "member" ? ` ${t("profile.displayNameCooldown")}` : ""}`
            : undefined
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
          seconds:
            failure?.error === "display_name_cooldown"
              ? (failure.retryAfterSeconds ?? 0) % 60
              : failure?.retryAfterSeconds,
          hours: Math.floor((failure?.retryAfterSeconds ?? 0) / 3600),
          minutes: Math.floor(((failure?.retryAfterSeconds ?? 0) % 3600) / 60),
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
