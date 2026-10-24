import { LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { Notice } from "./Notice";

export function Loading({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid flex-1 place-items-center py-8"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-6 animate-spin text-neutral-400"
      />
      <span className="sr-only">{children}</span>
    </div>
  );
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
