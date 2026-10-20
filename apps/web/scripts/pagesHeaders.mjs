// The response headers for Cloudflare Pages, which cannot run the nginx config the web image uses: a `_headers` file in
// the build output. Run after the build, with VITE_CHAT_SERVER_URL set:
//   npm run build:pages --workspace apps/web
// The policy has to say the same as apps/web/nginx.conf.template; pagesHeaders.test.mjs fails if they drift apart.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The chat-server's https address (for /rooms and the moderator sign-in) and its wss address (the socket).
export function chatServerSources(chatServerUrl) {
  const { origin, host, protocol } = new URL(chatServerUrl);

  return `${origin} ${protocol === "https:" ? "wss" : "ws"}://${host}`;
}

export function contentSecurityPolicy(chatServerUrl) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.giphy.com https://i.ytimg.com",
    "media-src https://*.giphy.com",
    "frame-src https://www.youtube-nocookie.com",
    `connect-src 'self' https://api.giphy.com ${chatServerSources(chatServerUrl)}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

export function pagesHeaders(chatServerUrl) {
  return `/*
  Content-Security-Policy: ${contentSecurityPolicy(chatServerUrl)}
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin

# Built files have a hash in their name, so they never change.
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chatServerUrl = process.env.VITE_CHAT_SERVER_URL;

  if (!chatServerUrl) {
    console.error(
      "VITE_CHAT_SERVER_URL is not set, so the policy cannot name the chat-server.",
    );
    process.exit(1);
  }

  const output = fileURLToPath(new URL("../dist/_headers", import.meta.url));
  writeFileSync(output, pagesHeaders(chatServerUrl));
  console.log(`Wrote ${output}`);
}
