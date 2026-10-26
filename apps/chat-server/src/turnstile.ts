import { env } from "./env.js";

export type HumanCheckAction =
  "guest_join" | "password_login" | "account_claim";
export type HumanCheckError =
  "human_check_required" | "human_check_failed" | "unavailable";

export function createHumanCheck(options: {
  secret?: string;
  hostname: string;
  allowTestKeys?: boolean;
}) {
  return async (
    token: unknown,
    action: HumanCheckAction,
    ip?: string,
  ): Promise<HumanCheckError | undefined> => {
    if (!options.secret) return undefined;
    if (typeof token !== "string" || !token || token.length > 2048)
      return "human_check_required";
    try {
      const body = new URLSearchParams({
        secret: options.secret,
        response: token,
      });
      if (ip) body.set("remoteip", ip);
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body,
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) return "unavailable";
      const result: unknown = await response.json();
      if (!result || typeof result !== "object") return "unavailable";
      const verified = result as Record<string, unknown>;
      const testing =
        options.allowTestKeys === true &&
        options.secret === "1x0000000000000000000000000000000AA";
      return verified.success === true &&
        (testing ||
          (verified.hostname === options.hostname &&
            verified.action === action))
        ? undefined
        : "human_check_failed";
    } catch {
      return "unavailable";
    }
  };
}

export const verifyHuman = createHumanCheck({
  secret: env.TURNSTILE_SECRET_KEY,
  hostname: new URL(env.WEB_ORIGIN).hostname,
  allowTestKeys: env.NODE_ENV !== "production",
});
