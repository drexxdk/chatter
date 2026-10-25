import { useEffect, useRef } from "react";

import {
  dismissSettingsErrorToast,
  showSettingsErrorToast,
} from "./components/AppToaster";
import type { useNotificationPreferences } from "./useNotificationPreferences";

export function useSettingsErrorToast(
  preferences: Pick<
    ReturnType<typeof useNotificationPreferences>,
    "status" | "retry" | "flush"
  >,
  inlineVisible: boolean,
) {
  const { status, retry, flush } = preferences;
  const retryLatest = useRef(() => {});

  useEffect(() => {
    retryLatest.current = () => {
      retry();
      flush();
    };
  }, [retry, flush]);

  useEffect(() => {
    if (inlineVisible || (status !== "load-error" && status !== "save-error")) {
      dismissSettingsErrorToast();
      return;
    }
    showSettingsErrorToast(status, () => retryLatest.current());
  }, [inlineVisible, status]);
}
