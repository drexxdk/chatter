import type { ComponentProps } from "react";

// The list of messages, in a room and in a private chat; announced politely when something is added.
export function MessageLog({
  label,
  ...props
}: Omit<ComponentProps<"ol">, "className" | "aria-label"> & { label: string }) {
  return (
    <ol
      {...props}
      role="log"
      aria-live="polite"
      aria-label={label}
      className="flex min-h-40 flex-1 flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 [&>*]:shrink-0 [&>:first-child]:mt-auto"
    />
  );
}
