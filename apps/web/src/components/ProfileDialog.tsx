import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import type { ActionResult, Session } from "../chat/useChat";
import { normalizeNickname } from "../nickname";
import { MAX_AGE, MIN_AGE, readAge, type ProfileChanges } from "../profile";
import { AvatarIcon } from "./Avatar";
import { ErrorAlert } from "./ErrorAlert";
import { AgeField, AvatarPicker } from "./ProfileFields";

// What the guest says about themselves, in a modal on top of the chat. A guest can change all of it; a moderator's name
// belongs to their account, so theirs is only shown.
export function ProfileDialog({
  open,
  onClose,
  session,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  onSave: (changes: ProfileChanges) => Promise<ActionResult>;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 transition-opacity duration-200 data-closed:opacity-0"
      />
      {/* Scrolls on its own when the form is taller than the screen, while the page behind stays put. */}
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel
            transition
            className="w-full max-w-sm space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0"
          >
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-lg font-semibold">
                {t("profile.title")}
              </DialogTitle>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("room.closePanel")}
                className="rounded-md p-1.5 hover:bg-slate-800"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {session.role === "moderator" ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 font-bold text-green-400">
                  <AvatarIcon avatar={session.avatar ?? PLAIN_AVATAR} />
                  {session.nickname}
                </p>
                <p className="text-sm text-slate-300">
                  {t("profile.moderatorNote")}
                </p>
              </div>
            ) : (
              <ProfileForm
                session={session}
                onSave={onSave}
                onClose={onClose}
              />
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
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
  const [name, setName] = useState(session.nickname);
  const [avatar, setAvatar] = useState<Avatar>(session.avatar ?? PLAIN_AVATAR);
  const [ageText, setAgeText] = useState(
    session.age === undefined ? "" : String(session.age),
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ActionResult & { ok: false }>();

  const nickname = normalizeNickname(name);
  const age = readAge(ageText);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);

    if (!nickname || !age.ok) return;

    const changes: ProfileChanges = {
      ...(nickname === session.nickname ? {} : { nickname }),
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
      <div className="space-y-1">
        <label htmlFor="profile-nickname" className="block text-sm font-medium">
          {t("nickname.label")}
        </label>
        <input
          id="profile-nickname"
          autoComplete="off"
          maxLength={24}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={touched && !nickname}
          aria-describedby="profile-nickname-hint"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        />
        <p
          id="profile-nickname-hint"
          className={
            touched && !nickname
              ? "text-sm text-red-300"
              : "text-sm text-slate-500"
          }
        >
          {t("nickname.hint")}
        </p>
      </div>

      <AvatarPicker value={avatar} onChange={setAvatar} name="profile-avatar" />
      <AgeField
        id="profile-age"
        value={ageText}
        onChange={setAgeText}
        invalid={touched && !age.ok}
      />

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
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 hover:bg-slate-800"
        >
          {t("nickname.cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? t("profile.saving") : t("profile.save")}
        </button>
      </div>
    </form>
  );
}
