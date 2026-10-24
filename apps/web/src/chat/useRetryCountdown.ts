import { useEffect } from "react";

// A failure that says how long to wait counts down, and goes when the wait is over.
export function useRetryCountdown<
  T extends { error: string; retryAfterSeconds?: number; retryAt?: number },
>(failure: T | undefined, setFailure: (next: T | undefined) => void) {
  const seconds =
    failure?.error === "rate_limited" ||
    failure?.error === "display_name_cooldown"
      ? failure.retryAfterSeconds
      : undefined;

  useEffect(() => {
    if (!failure || !seconds) return;

    const retryAt = failure.retryAt ?? Date.now() + seconds * 1000;
    const timer = setTimeout(() => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setFailure(
        remaining > 0
          ? { ...failure, retryAt, retryAfterSeconds: remaining }
          : undefined,
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [failure, seconds, setFailure]);
}
