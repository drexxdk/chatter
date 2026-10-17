import { useEffect } from "react";

// A failure that says how long to wait counts down, and goes when the wait is over.
export function useRetryCountdown<
  T extends { error: string; retryAfterSeconds?: number },
>(failure: T | undefined, setFailure: (next: T | undefined) => void) {
  const seconds =
    failure?.error === "rate_limited" ? failure.retryAfterSeconds : undefined;

  useEffect(() => {
    if (!failure || !seconds) return;

    const timer = setTimeout(
      () =>
        setFailure(
          seconds > 1
            ? { ...failure, retryAfterSeconds: seconds - 1 }
            : undefined,
        ),
      1000,
    );

    return () => clearTimeout(timer);
  }, [failure, seconds, setFailure]);
}
