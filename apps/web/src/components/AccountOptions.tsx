import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { authStartUrl, fetchAuthProviders } from "../api";
import { ButtonLink } from "./Button";
import { providerIcon } from "./ProviderIcons";

// The names are the services' own, written the same in every language.
const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  facebook: "Facebook",
  discord: "Discord",
  dev: "Dev sign-in",
};

export const providerName = (id: string) => PROVIDER_NAMES[id] ?? id;

// A provider as the logo and the name, for saying which one somebody is signed in through.
export function ProviderLabel({ provider }: { provider: string }) {
  const Icon = providerIcon(provider);

  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {providerName(provider)}
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

// A button for each provider that is on. Each is a link: the browser leaves for the provider and comes back to
// `returnPath`. Nothing at all when the chat-server has no provider, so there is no empty heading.
export function AccountOptions({
  returnPath,
  intro,
  divider,
  className,
}: {
  returnPath: string;
  intro: string;
  // A line with this word between the buttons and whatever follows, shown only with the buttons.
  divider?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const providers = useAuthProviders();

  if (providers.length === 0) return null;

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <p className="text-sm text-neutral-400">{intro}</p>
      <div className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <ButtonLink
            key={provider}
            href={authStartUrl(provider, returnPath)}
            icon={providerIcon(provider)}
            // The words are for those who cannot see the logo; the button shows the name.
            aria-label={t("account.continueWith", {
              provider: providerName(provider),
            })}
            className="text-sm focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            {providerName(provider)}
          </ButtonLink>
        ))}
      </div>
      {divider && (
        <p className="flex items-center gap-3 pt-2 text-sm text-neutral-400 before:h-px before:flex-1 before:bg-neutral-800 after:h-px after:flex-1 after:bg-neutral-800">
          {divider}
        </p>
      )}
    </div>
  );
}
