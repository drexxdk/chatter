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
  action: "guest_join" | "password_login" | "account_claim";
  onToken: (token: string | null) => void;
  busy: boolean;
  active?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const widget = useRef<TurnstileInstance>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [siteKey, setSiteKey] = useState<string | null>();
  const [failed, setFailed] = useState(false);
  const [readySize, setReadySize] = useState<string>();
  const compact = width !== undefined && width < 300;
  const size = compact ? "compact" : "flexible";
  const ready = readySize === size;
  const preview =
    siteKey === null &&
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const loading = siteKey !== null && !ready && !failed;

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
    if (!active || !container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width >= 1)
        setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [active, siteKey]);

  useEffect(() => {
    onToken(active && siteKey === null ? "" : null);
  }, [compact, active, siteKey, onToken]);

  if (!active || (siteKey === null && !preview)) return null;

  function fail() {
    onToken(null);
    setFailed(true);
  }

  return (
    <div
      ref={container}
      role="group"
      aria-label={t("humanCheck.label")}
      aria-busy={loading}
      className="min-w-0 space-y-2"
    >
      <div
        className="relative max-w-full"
        style={{ width: compact ? 150 : width, height: compact ? 140 : 65 }}
      >
        {!ready && (
          <div
            role={loading ? "status" : undefined}
            aria-label={loading ? t("humanCheck.label") : undefined}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xs border border-neutral-500 bg-[#232323] px-3 text-center text-xs text-neutral-400"
          >
            {preview && (
              <>
                <span className="text-sm text-neutral-200">
                  Cloudflare Turnstile
                </span>
                <span>{t("humanCheck.localhost")}</span>
              </>
            )}
          </div>
        )}
        {siteKey && width !== undefined && (
          <Turnstile
            ref={widget}
            siteKey={siteKey}
            className="absolute inset-0"
            style={{
              width: "100%",
              minWidth: 0,
              height: "100%",
              lineHeight: 0,
            }}
            options={{
              action,
              theme: "dark",
              size,
              language: i18n.language,
              responseField: false,
            }}
            onWidgetLoad={() => setReadySize(undefined)}
            onBeforeInteractive={() => setReadySize(size)}
            onSuccess={(token) => {
              setReadySize(size);
              setFailed(false);
              onToken(token);
            }}
            onExpire={() => onToken(null)}
            onTimeout={() => onToken(null)}
            onError={fail}
            scriptOptions={{ onError: fail }}
          />
        )}
      </div>
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
