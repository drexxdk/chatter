import { parseNotificationPreferences } from "../../../shared/notificationPreferences.mjs";
import type { NotificationSoundPreferences } from "../../../shared/notificationPreferences.mjs";
export type { NotificationSoundPreferences } from "../../../shared/notificationPreferences.mjs";

// Choices the guest made about how the chat looks. Unlike the session they belong to the browser, not the tab.
const SHOW_MOVEMENTS_KEY = "chatter.showMovements";
const SIDEBAR_OPEN_KEY = "chatter.sidebarOpen";
const NOTIFICATION_SOUND_KEY = "chatter.notificationSound";
const TERMS_KEY = "chatter.terms";
// What is kept when the terms could not be loaded at the moment of accepting them.
const TERMS_UNKNOWN = "unknown";

// Whether this browser has accepted the current version of the terms (and said it is 18 or older). `version` is the one
// the chat-server names; null when it could not be reached, in which case anything accepted before counts, so that a
// server that is down does not turn people away.
export function loadTermsAccepted(version: string | null): boolean {
  try {
    const stored = localStorage.getItem(TERMS_KEY);
    return version === null ? stored !== null : stored === version;
  } catch {
    return false;
  }
}

export function saveTermsAccepted(version: string | null): void {
  try {
    localStorage.setItem(TERMS_KEY, version ?? TERMS_UNKNOWN);
  } catch {
    // Storage can be full or switched off; the guest is then asked again next time.
  }
}

export function loadShowMovements(): boolean {
  try {
    return localStorage.getItem(SHOW_MOVEMENTS_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveShowMovements(show: boolean): void {
  try {
    localStorage.setItem(SHOW_MOVEMENTS_KEY, String(show));
  } catch {
    // Storage can be full or switched off; the choice then lasts until the page is closed.
  }
}

export function loadSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
  } catch {
    return;
  }
}

export function loadNotificationSound(): NotificationSoundPreferences {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(NOTIFICATION_SOUND_KEY) ?? "null",
    );
    const parsed = parseNotificationPreferences(value);
    if (parsed) return parsed;
  } catch {
    return { enabled: false, volume: 0.5 };
  }
  return { enabled: false, volume: 0.5 };
}

export function saveNotificationSound(
  value: NotificationSoundPreferences,
): void {
  try {
    localStorage.setItem(NOTIFICATION_SOUND_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}
