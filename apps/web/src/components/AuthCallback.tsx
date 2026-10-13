import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { accountOf, saveAccount } from "../account";
import {
  AccountError,
  fetchAccount,
  registerAccount,
  type AccountSession,
} from "../api";
import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { randomPicture } from "../chat/picture";
import { useLegal } from "../legal/useLegal";
import { normalizeNickname, normalizeUsername, tidyName } from "../nickname";
import { slugFromPath } from "../place";
import { loadTermsAccepted, saveTermsAccepted } from "../preferences";
import { readAge } from "../profile";
import { clearSession, loadSession, saveSession } from "../session";
import { providerName } from "./AccountOptions";
import { Button, ButtonLink } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Field } from "./Field";
import { Loading } from "./LoadState";
import { PageFrame } from "./PageFrame";
import {
  AvatarPicker,
  NameAndAge,
  PicturePicker,
  VisibleNote,
} from "./ProfileFields";
import { TermsCheckbox } from "./TermsCheckbox";

export type CallbackOutcome =
  | { kind: "error"; code: string }
  | { kind: "token"; token: string }
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
  if (token) return { outcome: { kind: "token", token }, returnPath };

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

    if (outcome.kind === "ticket") setView({ status: "form" });
  }, [outcome, returnPath, navigate]);

  return (
    <PageFrame>
      {view.status === "working" && <Loading>{t("account.working")}</Loading>}

      {view.status === "error" && (
        <div className="space-y-3">
          <ErrorAlert code={view.code} />
          <ButtonLink href={returnPath} className="inline-block text-sm">
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
  guest?: { avatar?: Avatar; age?: number };
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
  const [ageText, setAgeText] = useState(
    guest?.age === undefined ? "" : String(guest.age),
  );
  const rememberedTerms = loadTermsAccepted(termsVersion);
  const [termsChoice, setTermsChoice] = useState<boolean | null>(null);
  const termsAccepted = termsChoice ?? rememberedTerms;
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const usernameOk = normalizeUsername(username);
  const nickname = normalizeNickname(displayName);
  const age = readAge(ageText);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);
    setError(null);

    if (!usernameOk || !nickname || !age.ok || !termsAccepted) return;

    setBusy(true);

    try {
      const session = await registerAccount({
        ticket,
        username: usernameOk,
        nickname,
        picture,
        avatar,
        age: age.age,
      });

      if (!rememberedTerms) saveTermsAccepted(termsVersion);
      finish(session, returnPath, navigate);
    } catch (cause) {
      setError(codeOf(cause));
      setBusy(false);
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
        hint={t("account.register.usernameHint")}
        required
        autoFocus
        autoComplete="username"
        maxLength={24}
        value={username}
        // A username has no spaces, so they are not let in.
        onChange={(event) => setUsername(event.target.value.replace(/\s/g, ""))}
        invalid={touched && !usernameOk}
      />
      <NameAndAge
        nicknameId="register-nickname"
        ageId="register-age"
        nickname={displayName}
        onNicknameChange={setDisplayName}
        invalidNickname={touched && !nickname}
        nicknameLabel={t("account.register.displayName")}
        nicknameHint={t("account.register.displayNameHint")}
        age={ageText}
        onAgeChange={setAgeText}
        invalidAge={touched && !age.ok}
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
      <VisibleNote />

      <TermsCheckbox
        checked={termsAccepted}
        onChange={setTermsChoice}
        invalid={touched && !termsAccepted}
      />

      <ErrorAlert code={error} />

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            // Nothing was made: the browser goes back as it was, without an account.
            navigate(returnPath);
          }}
        >
          {t("nickname.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy
            ? t("account.register.submitting")
            : t("account.register.submit")}
        </Button>
      </div>
    </form>
  );
}
