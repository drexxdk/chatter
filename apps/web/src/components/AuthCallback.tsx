import { ArrowLeft, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { accountOf, clearAccount, saveAccount } from "../account";
import {
  AccountError,
  fetchAccount,
  fetchStaffSession,
  registerAccount,
  type AccountSession,
} from "../api";
import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import { useLegal } from "../legal/useLegal";
import { normalizeNickname, normalizeUsername, tidyName } from "../nickname";
import { slugFromPath } from "../place";
import { saveTermsAccepted } from "../preferences";
import { readBirthDate } from "../profile";
import {
  clearSession,
  loadSession,
  saveSession,
  saveModerator,
} from "../session";
import { usePageTitle } from "../usePageTitle";
import { providerName } from "./AccountOptions";
import { Button, ButtonLink } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Loading } from "./LoadState";
import { PageFrame } from "./PageFrame";
import { AvatarPicker, NameAndBirthDate, PicturePicker } from "./ProfileFields";
import { TermsCheckbox } from "./TermsCheckbox";

export type CallbackOutcome =
  | { kind: "error"; code: string }
  | { kind: "token"; token: string }
  | { kind: "staff"; token: string }
  | { kind: "ticket"; ticket: string; provider: string; name?: string };

// A path of this site; anything else is the lobby, so a made-up link cannot send somebody away.
const sitePath = (value: string | null) =>
  value &&
  /^\/(?!\/)/.test(value) &&
  !value.includes("\\") &&
  !value.startsWith("/auth/")
    ? value
    : "/";

// What the chat-server put after the `#` of the address when it sent the browser back (see accounts.ts there): an error,
// the session of an account that exists, or a ticket for somebody who still has to choose a nickname.
export function parseCallback(hash: string): {
  outcome: CallbackOutcome;
  returnPath: string;
} {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const returnPath = sitePath(params.get("return"));
  const error = params.get("error");
  const token = params.get("token");
  const ticket = params.get("ticket");

  if (error) return { outcome: { kind: "error", code: error }, returnPath };
  if (token)
    return {
      outcome: { kind: params.get("staff") === "1" ? "staff" : "token", token },
      returnPath,
    };

  if (ticket) {
    const name = params.get("name");

    return {
      outcome: {
        kind: "ticket",
        ticket,
        provider: params.get("provider") ?? "",
        ...(name ? { name } : {}),
      },
      returnPath,
    };
  }

  return { outcome: { kind: "error", code: "failed" }, returnPath };
}

type View =
  | { status: "working" }
  | { status: "error"; code: string }
  | { status: "form"; error?: string };

// Takes the sign-in to its end: the account is kept in this browser and the browser goes on to where it was.
function finish(
  session: AccountSession,
  returnPath: string,
  navigate: (path: string) => void,
) {
  const { token, profile } = session;

  saveAccount(accountOf(session));
  // The guest this tab was is the account now; a room's address brings it back in as the account.
  clearSession();
  if (slugFromPath(returnPath)) {
    saveSession({ nickname: profile.nickname, token });
  }

  navigate(returnPath);
}

const codeOf = (error: unknown) =>
  error instanceof AccountError ? error.code : "connection";

// Where the providers send the browser back to. It is a page of its own, in the frame of the site, for the moment between
// the provider and the chat: it shows that it is working, what went wrong, or asks for a nickname.
export function AuthCallback({
  hash = window.location.hash,
  navigate = (path) => window.location.replace(path),
}: {
  // What follows the `#` of the address, and how to go on to a path; the browser's own unless a test gives them.
  hash?: string;
  navigate?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [{ outcome, returnPath }] = useState(() => parseCallback(hash));
  const [view, setView] = useState<View>(
    outcome.kind === "error"
      ? { status: "error", code: outcome.code }
      : { status: "working" },
  );
  const started = useRef(false);
  // A guest who connects a provider starts from who they were; the form asks for what an account needs besides.
  const [guest] = useState(() => {
    const saved = loadSession();
    return saved && !saved.token ? saved : undefined;
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // The ticket or the token is not to stay in the address bar or the history.
    window.history.replaceState(null, "", window.location.pathname);

    if (outcome.kind === "token") {
      fetchAccount(outcome.token)
        .then((session) => finish(session, returnPath, navigate))
        .catch((error: unknown) =>
          setView({ status: "error", code: codeOf(error) }),
        );
    }

    if (outcome.kind === "staff") {
      fetchStaffSession(outcome.token)
        .then((staff) => {
          clearAccount();
          clearSession();
          saveModerator({ nickname: staff.name, token: outcome.token });
          saveSession({ nickname: staff.name, token: outcome.token });
          navigate(returnPath);
        })
        .catch((error: unknown) =>
          setView({ status: "error", code: codeOf(error) }),
        );
    }

    if (outcome.kind === "ticket") setView({ status: "form" });
  }, [outcome, returnPath, navigate]);

  usePageTitle(
    view.status === "form" ? t("account.register.title") : undefined,
  );

  return (
    <PageFrame>
      {view.status === "working" && <Loading>{t("account.working")}</Loading>}

      {view.status === "error" && (
        <div className="space-y-3">
          <ErrorAlert code={view.code} />
          <ButtonLink href={returnPath} icon={ArrowLeft} className="text-sm">
            {t("account.back")}
          </ButtonLink>
        </div>
      )}

      {view.status === "form" && outcome.kind === "ticket" && (
        <RegisterForm
          ticket={outcome.ticket}
          provider={outcome.provider}
          suggested={guest?.nickname ?? outcome.name}
          guest={guest}
          returnPath={returnPath}
          navigate={navigate}
          initialError={view.error}
        />
      )}
    </PageFrame>
  );
}

// For somebody the provider has vouched for and who has no account yet: a username of their own, the name the chat
// shows, an avatar, and the terms.
function RegisterForm({
  ticket,
  provider,
  suggested,
  guest,
  returnPath,
  navigate,
  initialError,
}: {
  ticket: string;
  provider: string;
  suggested?: string;
  // Who this tab was as a guest, whose avatar and age carry over.
  guest?: { avatar?: Avatar; age?: number; birthDate?: string };
  returnPath: string;
  navigate: (path: string) => void;
  initialError?: string;
}) {
  const { t } = useTranslation();
  const legal = useLegal();
  const termsVersion =
    legal.state.status === "ready" ? legal.state.legal.version : null;
  const [displayName, setDisplayName] = useState(
    suggested && normalizeNickname(suggested) ? tidyName(suggested) : "",
  );
  // The provider's name for them, without the spaces, to start from; it is only a suggestion and is never shown.
  const [username, setUsername] = useState(
    suggested && normalizeUsername(suggested.replace(/\s/g, ""))
      ? suggested.replace(/\s/g, "")
      : "",
  );
  // Somebody who does not choose gets one at random.
  const [picture, setPicture] = useState(() => randomPicture());
  const [avatar, setAvatar] = useState<Avatar>(guest?.avatar ?? PLAIN_AVATAR);
  const [birthDateText, setBirthDateText] = useState(guest?.birthDate ?? "");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const usernameOk = normalizeUsername(username);
  const nickname = normalizeNickname(displayName);
  const birthDate = readBirthDate(birthDateText);
  const usernameError =
    error === "reserved_username" || error === "invalid_username";
  const displayNameError =
    error === "reserved_display_name" || error === "invalid_display_name";

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget;
    setTouched(true);
    setError(null);

    if (!usernameOk || !nickname || !birthDate.ok || !termsAccepted) return;

    setBusy(true);

    try {
      const session = await registerAccount({
        ticket,
        username: usernameOk,
        nickname,
        picture,
        avatar,
        birthDate: birthDate.birthDate,
      });

      saveTermsAccepted(termsVersion);
      finish(session, returnPath, navigate);
    } catch (cause) {
      const code = codeOf(cause);
      const field =
        code === "reserved_nickname" || code === "invalid_nickname"
          ? "register-nickname"
          : code === "reserved_username" || code === "invalid_username"
            ? "register-username"
            : null;
      setError(
        code === "reserved_nickname"
          ? "reserved_display_name"
          : code === "invalid_nickname"
            ? "invalid_display_name"
            : code,
      );
      setBusy(false);
      if (field) form.querySelector<HTMLInputElement>(`#${field}`)?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t("account.register.title")}</h1>
        <p className="text-sm text-neutral-300">
          {t("account.register.intro", { provider: providerName(provider) })}
        </p>
      </div>

      <Field
        id="register-username"
        label={t("account.register.username")}
        hint={
          usernameError
            ? t(`errors.${error}`)
            : t("account.register.usernameHint")
        }
        required
        autoFocus
        autoComplete="username"
        maxLength={24}
        value={username}
        // A username has no spaces, so they are not let in.
        onChange={(event) => {
          setUsername(event.target.value.replace(/\s/g, ""));
          if (usernameError) setError(null);
        }}
        invalid={usernameError || (touched && !usernameOk)}
      />
      <NameAndBirthDate
        nicknameId="register-nickname"
        ageId="register-age"
        nickname={displayName}
        onNicknameChange={(value) => {
          setDisplayName(value);
          if (displayNameError) setError(null);
        }}
        invalidNickname={displayNameError || (touched && !nickname)}
        nicknameLabel={t("account.register.displayName")}
        nicknameHint={
          displayNameError
            ? t(`errors.${error}`)
            : t("account.register.displayNameHint")
        }
        birthDate={birthDateText}
        onBirthDateChange={setBirthDateText}
        invalidAge={touched && !birthDate.ok}
        autoComplete="name"
      />
      <PicturePicker
        value={picture}
        onChange={setPicture}
        name="register-picture"
      />
      <AvatarPicker
        value={avatar}
        onChange={setAvatar}
        name="register-avatar"
      />

      <TermsCheckbox
        checked={termsAccepted}
        onChange={setTermsAccepted}
        invalid={touched && !termsAccepted}
      />

      <ErrorAlert code={error} />

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          icon={X}
          onClick={() => {
            // Nothing was made: the browser goes back as it was, without an account.
            navigate(returnPath);
          }}
        >
          {t("nickname.cancel")}
        </Button>
        <Button type="submit" variant="primary" icon={UserPlus} disabled={busy}>
          {busy
            ? t("account.register.submitting")
            : t("account.register.submit")}
        </Button>
      </div>
    </form>
  );
}
