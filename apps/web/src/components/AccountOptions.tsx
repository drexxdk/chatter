import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { authStartUrl, fetchAuthProviders } from "../api";
import { ButtonLink } from "./Button";

// The names are the services' own, written the same in every language.
const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  facebook: "Facebook",
  discord: "Discord",
  dev: "Dev sign-in",
};

export const providerName = (id: string) => PROVIDER_NAMES[id] ?? id;

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
  className,
}: {
  returnPath: string;
  intro: string;
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
            className="text-sm focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            {t("account.continueWith", { provider: providerName(provider) })}
          </ButtonLink>
        ))}
      </div>
    </div>
  );
}
