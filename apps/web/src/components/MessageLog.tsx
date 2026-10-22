import { useEffect, useState, type ComponentProps } from "react";

import { createMessageEffects, MessageEffectsContext } from "./messageEffects";

// The list of messages, in a room and in a private chat; announced politely when something is added.
export function MessageLog({
  label,
  ...props
}: Omit<ComponentProps<"ol">, "className" | "aria-label"> & { label: string }) {
  const [effects] = useState(createMessageEffects);
  useEffect(() => effects.ready(), [effects]);

  return (
    <MessageEffectsContext value={effects}>
      <ol
        {...props}
        role="log"
        aria-live="polite"
        aria-label={label}
        className="flex min-h-40 flex-1 flex-col gap-2 py-3 [&>*]:shrink-0 [&>:first-child]:mt-auto"
      />
    </MessageEffectsContext>
  );
}
