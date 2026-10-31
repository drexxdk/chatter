import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogIn, Unlink, X } from "lucide-react";

import {
  AccountError,
  authStartUrl,
  fetchAuthProviders,
  fetchProviderConnections,
  disconnectProvider,
  startProviderLink,
  type ProviderConnections,
} from "../api";
import { ErrorAlert } from "./ErrorAlert";
import { Button, ButtonLink } from "./Button";
import { providerIcon } from "./ProviderIcons";
import { Notice } from "./Notice";

// The names are the services' own, written the same in every language.
const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  facebook: "Facebook",
  discord: "Discord",
  dev: "Dev sign-in",
};

const PROVIDER_BUTTON_CLASS =
  "h-14 min-w-0 w-full flex-col gap-1! px-0 [&>svg]:size-5";

export const providerName = (id: string) => PROVIDER_NAMES[id] ?? id;

// A provider as the logo and the name, for saying which one somebody is signed in through.
export function ProviderLabel({ provider }: { provider: string }) {
  const Icon = providerIcon(provider);
  const { t } = useTranslation();

  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {provider === "password"
        ? t("nickname.password")
        : providerName(provider)}
    </span>
  );
}

// The providers the chat-server has switched on, once it has said; none until then, and none when it has none.
export function useAuthProviders(): string[] {
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void fetchAuthProviders().then((list) => {
      if (!cancelled) setProviders(list);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}

export function AccountProviders({
  token,
  onActionChange,
  separated = true,
}: {
  token: string;
  onActionChange?: (active: boolean) => void;
  separated?: boolean;
}) {
  const { t } = useTranslation();
  const available = useAuthProviders();
  const [connections, setConnections] = useState<ProviderConnections>();
  const connected = connections?.providers ?? [];
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setConnections(undefined);
    void fetchProviderConnections(token)
      .then((value) => {
        if (!cancelled) setConnections(value);
      })
      .catch(() => {
        if (!cancelled) setError("connection");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function connect(provider: string) {
    setBusy(provider);
    setError(undefined);
    try {
      const url = await startProviderLink(
        token,
        provider,
        `${window.location.pathname}?dialog=profile`,
      );
      window.location.assign(url);
    } catch (cause) {
      setError(cause instanceof AccountError ? cause.code : "connection");
      setBusy(undefined);
    }
  }

  function finish() {
    setConfirming(undefined);
    setError(undefined);
    onActionChange?.(false);
  }

  async function disconnect() {
    if (!confirming || busy || !connections?.canDisconnect) return;
    setBusy(confirming);
    setError(undefined);
    try {
      setConnections(await disconnectProvider(token, confirming));
      finish();
    } catch (cause) {
      setError(cause instanceof AccountError ? cause.code : "connection");
    } finally {
      setBusy(undefined);
    }
  }

  if (available.length === 0 && connected.length === 0 && !error) return null;
  return (
    <section
      aria-label={t("profile.providers")}
      className={`space-y-3 ${separated ? "border-t border-neutral-800 pt-4" : ""}`}
    >
      <h3 className="text-sm font-semibold">
        {confirming
          ? t("profile.disconnectQuestion", {
              provider: providerName(confirming),
            })
          : t("profile.providers")}
      </h3>
      <ErrorAlert code={error ?? null} />
      {confirming ? (
        <>
          {!connections?.canDisconnect && (
            <Notice tone="warning">{t("errors.last_sign_in_method")}</Notice>
          )}
          <div className="modal-actions flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              icon={X}
              disabled={busy !== undefined}
              onClick={finish}
            >
              {t("nickname.cancel")}
            </Button>
            <Button
              variant="danger"
              icon={Unlink}
              loading={busy !== undefined}
              disabled={busy !== undefined || !connections?.canDisconnect}
              onClick={() => void disconnect()}
            >
              {t("profile.disconnectProvider", {
                provider: providerName(confirming),
              })}
            </Button>
          </div>
        </>
      ) : (
        <div className="grid auto-cols-fr grid-flow-col gap-2">
          {[...new Set([...available, ...connected])].map((provider) => {
            const linked = connected.includes(provider);
            const label = t(
              linked ? "profile.disconnectProvider" : "profile.connectProvider",
              { provider: providerName(provider) },
            );
            return (
              <Button
                key={provider}
                variant="tile"
                icon={providerIcon(provider)}
                aria-label={label}
                aria-pressed={linked}
                title={label}
                className={PROVIDER_BUTTON_CLASS}
                loading={busy === provider}
                disabled={loading || !connections || busy !== undefined}
                onClick={() => {
                  if (linked) {
                    setError(undefined);
                    setConfirming(provider);
                    onActionChange?.(true);
                  } else void connect(provider);
                }}
              >
                <span className="text-center text-xs leading-4 whitespace-nowrap">
                  {providerName(provider)}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// A button for each provider that is on. Each is a link: the browser leaves for the provider and comes back to
// `returnPath`. Nothing at all when the chat-server has no provider, so there is no empty heading.
export function AccountOptions({
  returnPath,
  intro,
  divider,
  className,
  onSignIn,
}: {
  returnPath: string;
  intro?: string;
  // A line with this word between the buttons and whatever follows, shown only with the buttons.
  divider?: string;
  className?: string;
  onSignIn?: () => void;
}) {
  const { t } = useTranslation();
  const providers = useAuthProviders();

  if (providers.length === 0 && !onSignIn) return null;

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {intro && <p className="text-sm text-neutral-400">{intro}</p>}
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {onSignIn && (
          <Button
            variant="tile"
            icon={LogIn}
            onClick={onSignIn}
            aria-label={t("account.continueWith", {
              provider: t("account.local"),
            })}
            title={t("account.local")}
            className={PROVIDER_BUTTON_CLASS}
          >
            <span className="text-center text-xs leading-4 whitespace-nowrap">
              {t("account.local")}
            </span>
          </Button>
        )}
        {providers.map((provider) => (
          <ButtonLink
            key={provider}
            variant="tile"
            href={authStartUrl(provider, returnPath)}
            icon={providerIcon(provider)}
            // The words are for those who cannot see the logo; the button shows the name.
            aria-label={t("account.continueWith", {
              provider: providerName(provider),
            })}
            title={providerName(provider)}
            className={PROVIDER_BUTTON_CLASS}
          >
            <span className="text-center text-xs leading-4 whitespace-nowrap">
              {providerName(provider)}
            </span>
          </ButtonLink>
        ))}
      </div>
      {divider && (
        <p className="flex items-center gap-3 pt-2 text-sm text-neutral-400 before:h-px before:flex-1 before:bg-neutral-700 after:h-px after:flex-1 after:bg-neutral-700">
          {divider}
        </p>
      )}
    </div>
  );
}
