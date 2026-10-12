// Choices the guest made about how the chat looks. Unlike the session they belong to the browser, not the tab.
const SHOW_MOVEMENTS_KEY = "chatter.showMovements";
const NOTIFY_DIRECT_KEY = "chatter.notifyDirect";
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

// On unless the guest switched it off.
export function loadNotifyDirect(): boolean {
  try {
    return localStorage.getItem(NOTIFY_DIRECT_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveNotifyDirect(notify: boolean): void {
  try {
    localStorage.setItem(NOTIFY_DIRECT_KEY, String(notify));
  } catch {
    // Storage can be full or switched off; the choice then lasts until the page is closed.
  }
}

// On unless the guest switched it off.
export function loadShowMovements(): boolean {
  try {
    return localStorage.getItem(SHOW_MOVEMENTS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveShowMovements(show: boolean): void {
  try {
    localStorage.setItem(SHOW_MOVEMENTS_KEY, String(show));
  } catch {
    // Storage can be full or switched off; the choice then lasts until the page is closed.
  }
}
