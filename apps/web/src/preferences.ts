// Choices the guest made about how the chat looks. Unlike the session they belong to the browser, not the tab.
const SHOW_MOVEMENTS_KEY = "chatter.showMovements";
const NOTIFY_DIRECT_KEY = "chatter.notifyDirect";

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
