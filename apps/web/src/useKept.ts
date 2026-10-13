import { useEffect, useState } from "react";

// The last value that was not null, kept for a while after it has gone, so that what is shown for it can fade out
// instead of vanishing with it.
export function useKept<T>(value: T | null, ms = 300): T | null {
  const [kept, setKept] = useState(value);

  if (value !== null && value !== kept) setKept(value);

  useEffect(() => {
    if (value !== null) return;

    const timer = setTimeout(() => setKept(null), ms);

    return () => clearTimeout(timer);
  }, [value, ms]);

  return value ?? kept;
}
