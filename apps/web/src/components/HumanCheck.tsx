import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchAuthConfiguration } from "../api";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";

export function HumanCheck({
  action,
  onToken,
  busy,
  active = true,
}: {
  action: "guest_join" | "password_login";
  onToken: (token: string | null) => void;
  busy: boolean;
  active?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const widget = useRef<TurnstileInstance>(null);
  const container = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (active)
      void fetchAuthConfiguration().then((config) => {
        if (cancelled) return;
        setSiteKey(config?.turnstileSiteKey);
        setFailed(!config);
        onToken(config?.turnstileSiteKey === null ? "" : null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, onToken]);

  useEffect(() => {
    if (!busy) {
      widget.current?.reset();
      onToken(active && siteKey === null ? "" : null);
    }
  }, [busy, active, siteKey, onToken]);

  useEffect(() => {
    if (!active || !siteKey || !container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setCompact(entry.contentRect.width < 300);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [active, siteKey]);

  useEffect(() => {
    onToken(null);
  }, [compact, onToken]);

  if (!active || siteKey === null) return null;

  function fail() {
    onToken(null);
    setFailed(true);
  }

  return (
    <div
      ref={container}
      role="group"
      aria-label={t("humanCheck.label")}
      className="min-w-0 space-y-2"
    >
      {siteKey && (
        <Turnstile
          ref={widget}
          siteKey={siteKey}
          options={{
            action,
            theme: "dark",
            size: compact ? "compact" : "flexible",
            language: i18n.language,
            responseField: false,
          }}
          onSuccess={(token) => {
            setFailed(false);
            onToken(token);
          }}
          onExpire={() => onToken(null)}
          onTimeout={() => onToken(null)}
          onError={fail}
          scriptOptions={{ onError: fail }}
        />
      )}
      <ErrorAlert code={failed ? "human_check_unavailable" : null} />
      {failed && (
        <Button
          type="button"
          icon={RefreshCw}
          onClick={() => window.location.reload()}
        >
          {t("humanCheck.retry")}
        </Button>
      )}
    </div>
  );
}
