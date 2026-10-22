import { useState } from "react";

const PREFIX = "chatter.draft.";
const MAX_SIZE = 64_000;
const MAX_DRAFTS = 32;
const MAX_AGE = 8 * 60 * 60 * 1000;

export function readTabDraft(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    if (raw.length > MAX_SIZE) {
      sessionStorage.removeItem(PREFIX + key);
      return undefined;
    }
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      typeof value.savedAt !== "number" ||
      value.savedAt > Date.now() ||
      Date.now() - value.savedAt >= MAX_AGE
    ) {
      sessionStorage.removeItem(PREFIX + key);
      return undefined;
    }
    return value.data;
  } catch {
    return undefined;
  }
}

export function writeTabDraft(key: string, data: unknown) {
  try {
    const storageKey = PREFIX + key;
    if (data === undefined || data === "") {
      sessionStorage.removeItem(storageKey);
      return;
    }
    const raw = JSON.stringify({ version: 1, savedAt: Date.now(), data });
    if (raw.length > MAX_SIZE) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    if (sessionStorage.getItem(storageKey) === null) {
      const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.key(index),
      ).filter((value): value is string => Boolean(value?.startsWith(PREFIX)));
      while (keys.length >= MAX_DRAFTS)
        sessionStorage.removeItem(keys.shift()!);
    }
    sessionStorage.setItem(storageKey, raw);
  } catch {
    return;
  }
}

export function clearTabDrafts() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index),
    );
    for (const key of keys) {
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    return;
  }
}

export function useTabText(key: string | null, initial = "") {
  const [stored, setStored] = useState(() => {
    const value = key ? readTabDraft(key) : undefined;
    return { key, value: typeof value === "string" ? value : initial };
  });
  let value = stored.value;
  if (stored.key !== key) {
    const saved = key ? readTabDraft(key) : undefined;
    value = typeof saved === "string" ? saved : initial;
    setStored({ key, value });
  }
  return [
    value,
    (next: string) => {
      if (key) writeTabDraft(key, next);
      setStored({ key, value: next });
    },
  ] as const;
}
