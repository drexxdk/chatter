import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { Notice } from "./Notice";

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
      <Button icon={RotateCw} onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
