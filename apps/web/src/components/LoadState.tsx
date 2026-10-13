import { Notice } from "./Notice";
import { Button } from "./Button";
import type { ReactNode } from "react";

export function Loading({ children }: { children: ReactNode }) {
  return <p role="status">{children}</p>;
}

// Something that could not be fetched, and a way to try again.
export function LoadError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-2">
      <Notice role="alert" tone="error">
        {message}
      </Notice>
      <Button onClick={onRetry}>{retryLabel}</Button>
    </div>
  );
}
