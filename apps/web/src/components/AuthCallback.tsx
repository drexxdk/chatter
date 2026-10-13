import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import { saveAccount } from "../account";
import {
  AccountError,
  fetchAccount,
  registerAccount,
  type AccountSession,
} from "../api";
import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { useLegal } from "../legal/useLegal";
import { normalizeNickname } from "../nickname";
import { slugFromPath } from "../place";
import { loadTermsAccepted, saveTermsAccepted } from "../preferences";
import { readAge } from "../profile";
import { clearSession, loadSession, saveSession } from "../session";
import { providerName } from "./AccountOptions";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { HeaderFrame } from "./HeaderFrame";
import { LegalSentence } from "./LegalLinks";
import { MainMenu } from "./MainMenu";
import { AvatarPicker, NameAndAge, VisibleNote } from "./ProfileFields";

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
  const { token, provider, profile, expiresAt } = session;

  saveAccount({
    token,
    provider,
    nickname: profile.nickname,
    avatar: profile.avatar,
    ...(profile.age === undefined ? {} : { age: profile.age }),
    expiresAt,
  });
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

    if (outcome.kind === "ticket") {
      const guest = loadSession();

      // A guest who connects a provider keeps who they are: the account is made with the nickname, the avatar and the
      // age they had, so that they stay in the room as the same person.
      if (guest && !guest.token) {
        registerAccount({
          ticket: outcome.ticket,
          nickname: guest.nickname,
          avatar: guest.avatar ?? PLAIN_AVATAR,
          age: guest.age,
        })
          .then((session) => finish(session, returnPath, navigate))
          .catch((error: unknown) => {
            const code = codeOf(error);

            // The nickname cannot be kept (somebody has it): another one can be chosen.
            if (code === "reserved_nickname" || code === "invalid_nickname") {
              setView({ status: "form", error: code });
            } else {
              setView({ status: "error", code });
            }
          });
      } else {
        setView({ status: "form" });
      }
    }
  }, [outcome, returnPath, navigate]);

  return (
    <div className="flex min-h-dvh flex-col">
      <HeaderFrame>
        <a href="/" className="text-2xl font-bold">
          {t("app.title")}
        </a>
        <MainMenu />
      </HeaderFrame>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-(--page-gutter) pb-8">
        {view.status === "working" && (
          <p role="status">{t("account.working")}</p>
        )}

        {view.status === "error" && (
          <div className="space-y-3">
            <ErrorAlert code={view.code} />
            <a
              href={returnPath}
              className="inline-block rounded-md bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
            >
              {t("account.back")}
            </a>
          </div>
        )}

        {view.status === "form" && outcome.kind === "ticket" && (
          <RegisterForm
            ticket={outcome.ticket}
            provider={outcome.provider}
            suggested={outcome.name}
            returnPath={returnPath}
            navigate={navigate}
            initialError={view.error}
          />
        )}
      </main>
    </div>
  );
}

// For somebody the provider has vouched for and who has no account yet: who they want to be, and the terms.
function RegisterForm({
  ticket,
  provider,
  suggested,
  returnPath,
  navigate,
  initialError,
}: {
  ticket: string;
  provider: string;
  suggested?: string;
  returnPath: string;
  navigate: (path: string) => void;
  initialError?: string;
}) {
  const { t } = useTranslation();
  const legal = useLegal();
  const termsVersion =
    legal.state.status === "ready" ? legal.state.legal.version : null;
  const [value, setValue] = useState(
    suggested && normalizeNickname(suggested) ? suggested : "",
  );
  const [avatar, setAvatar] = useState<Avatar>(PLAIN_AVATAR);
  const [ageText, setAgeText] = useState("");
  const [termsTicked, setTermsTicked] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const nickname = normalizeNickname(value);
  const age = readAge(ageText);
  const remembered = loadTermsAccepted(termsVersion);
  const termsAccepted = remembered || termsTicked;

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);
    setError(null);

    if (!nickname || !age.ok || !termsAccepted) return;

    setBusy(true);

    try {
      const session = await registerAccount({
        ticket,
        nickname,
        avatar,
        age: age.age,
      });

      if (!remembered) saveTermsAccepted(termsVersion);
      finish(session, returnPath, navigate);
    } catch (cause) {
      setError(codeOf(cause));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t("account.register.title")}</h1>
        <p className="text-sm text-neutral-300">
          {t("account.register.intro", { provider: providerName(provider) })}
        </p>
      </div>

      <NameAndAge
        nicknameId="register-nickname"
        ageId="register-age"
        nickname={value}
        onNicknameChange={setValue}
        invalidNickname={touched && !nickname}
        age={ageText}
        onAgeChange={setAgeText}
        invalidAge={touched && !age.ok}
        autoFocus
        autoComplete="nickname"
      />
      <AvatarPicker
        value={avatar}
        onChange={setAvatar}
        name="register-avatar"
      />
      <VisibleNote />

      {remembered ? (
        <p className="text-xs text-neutral-400">
          <LegalSentence i18nKey="terms.accepted" />
        </p>
      ) : (
        <div className="space-y-1">
          <label className="flex items-start gap-2 rounded-md bg-neutral-950 p-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={termsTicked}
              onChange={(event) => setTermsTicked(event.target.checked)}
              aria-invalid={touched && !termsTicked}
              className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500"
            />
            <span>
              <LegalSentence i18nKey="terms.accept" />
            </span>
          </label>
          {touched && !termsTicked && (
            <p className="text-sm text-red-300">{t("terms.acceptRequired")}</p>
          )}
        </div>
      )}

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
