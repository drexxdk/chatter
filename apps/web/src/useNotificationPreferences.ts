import { useEffect, useRef, useState } from "react";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "./api";
import {
  loadNotificationSound,
  saveNotificationSound,
  type NotificationSoundPreferences,
} from "./preferences";
import {
  prepareNotificationSound,
  setAccountNotificationSound,
} from "./notificationSound";

export function useNotificationPreferences(token?: string) {
  const [value, setValue] = useState<NotificationSoundPreferences>(() =>
    token ? { enabled: false, volume: 0.5 } : loadNotificationSound(),
  );
  const [status, setStatus] = useState<
    "loading" | "saving" | "saved" | "load-error" | "save-error"
  >("saved");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const revision = useRef(0);
  const owner = useRef(token);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<(() => void) | undefined>(undefined);
  const writes = useRef(Promise.resolve());

  function flush() {
    clearTimeout(timer.current);
    const save = pending.current;
    pending.current = undefined;
    save?.();
  }

  useEffect(() => {
    owner.current = token;
    const version = ++revision.current;
    const initial = token
      ? { enabled: false, volume: 0.5 }
      : loadNotificationSound();
    setValue(initial);
    setAccountNotificationSound(token ? initial : undefined);
    setStatus(token ? "loading" : "saved");
    let cancelled = false;
    if (token)
      void writes.current
        .then(() => fetchNotificationPreferences(token))
        .then((preferences) => {
          if (cancelled || revision.current !== version) return;
          setValue(preferences);
          setAccountNotificationSound(preferences);
          setStatus("saved");
        })
        .catch(() => {
          if (!cancelled && revision.current === version)
            setStatus("load-error");
        });
    return () => {
      cancelled = true;
      flush();
      setAccountNotificationSound(undefined);
    };
  }, [token, loadAttempt]);

  function change(next: NotificationSoundPreferences) {
    setValue(next);
    if (!token) {
      saveNotificationSound(next);
      void prepareNotificationSound();
      return;
    }
    setAccountNotificationSound(next);
    const version = ++revision.current;
    setStatus("saving");
    clearTimeout(timer.current);
    pending.current = () => {
      writes.current = writes.current
        .catch(() => {})
        .then(async () => {
          try {
            await updateNotificationPreferences(token, next);
            if (owner.current === token && revision.current === version)
              setStatus("saved");
          } catch {
            if (owner.current === token && revision.current === version)
              setStatus("save-error");
          }
        });
    };
    timer.current = setTimeout(flush, 300);
    void prepareNotificationSound();
  }

  return {
    value,
    change,
    status,
    flush,
    retry: () =>
      status === "load-error"
        ? setLoadAttempt((attempt) => attempt + 1)
        : change(value),
  };
}
