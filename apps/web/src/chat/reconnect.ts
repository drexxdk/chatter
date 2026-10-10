// About four minutes of trying, never more than 30 seconds apart: long enough for a server restart or a patchy
// network, and a tab in the background has its timers slowed down by the browser anyway.
export const DEFAULT_RECONNECT_DELAYS_MS = [
  1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 30_000, 30_000, 30_000, 30_000,
  30_000, 30_000,
];

// Waits out a delay, but not when the browser says the network is back or the guest has returned to the tab: that is
// the moment a retry is most likely to work, and a background tab's timers may have been held up.
export function waitOrWake(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      document.removeEventListener("visibilitychange", onVisibility);
      resolve();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") done();
    };
    const timer = setTimeout(done, ms);

    window.addEventListener("online", done);
    document.addEventListener("visibilitychange", onVisibility);
  });
}
// Errors the server reports in connect_error; anything else (network failure, CORS) is a connection problem.
export const HANDSHAKE_ERRORS = new Set([
  "invalid_nickname",
  "reserved_nickname",
  "invalid_token",
  "banned",
  "unavailable",
  "too_many_connections",
]);
// Rejections that retrying cannot fix. A full per-network limit is not one: the guest's own dropped connection may
// still be counted for a while.
export const PERMANENT_ERRORS = new Set([
  "invalid_nickname",
  "reserved_nickname",
  "invalid_token",
  "banned",
]);
// Disconnects somebody chose (this client, or the server kicking the guest); everything else is a dropped connection.
export const DELIBERATE_DISCONNECTS = new Set([
  "io client disconnect",
  "io server disconnect",
]);
