export const CHAT_SERVER_URL: string =
  import.meta.env.VITE_CHAT_SERVER_URL ?? "http://localhost:4000";

// Named in the terms and the privacy policy, for questions, reports and requests.
export const CONTACT_EMAIL: string =
  import.meta.env.VITE_CONTACT_EMAIL ?? "draxxdk@gmail.com";

// The code the site runs on, which anybody can read.
export const SOURCE_URL = "https://github.com/drexxdk/chatter";

export const HEALTH_URL = new URL("/health", CHAT_SERVER_URL).href;

export const ADMIN_URL: string =
  import.meta.env.VITE_ADMIN_URL ??
  (import.meta.env.DEV
    ? "http://localhost:3000/admin"
    : "https://chatter-drexx-admin.duckdns.org/admin");
