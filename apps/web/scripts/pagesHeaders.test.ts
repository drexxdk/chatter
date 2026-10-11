import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  chatServerSources,
  contentSecurityPolicy,
  pagesHeaders,
} from "./pagesHeaders.mjs";

const nginx = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../nginx.conf.template"),
  "utf8",
);

const nginxHeader = (name: string) =>
  new RegExp(`add_header ${name} "([^"]+)" always;`).exec(nginx)?.[1];

describe("headers for Cloudflare Pages", () => {
  it("names the chat-server's https and wss addresses", () => {
    expect(chatServerSources("https://api.example.org")).toBe(
      "https://api.example.org wss://api.example.org",
    );
    expect(chatServerSources("http://localhost:4000")).toBe(
      "http://localhost:4000 ws://localhost:4000",
    );
  });

  it("says what the nginx config says", () => {
    const fromNginx = nginxHeader("Content-Security-Policy")?.replace(
      "${CHAT_SERVER_SOURCES}",
      "https://api.example.org wss://api.example.org",
    );

    expect(fromNginx).toBeDefined();
    expect(contentSecurityPolicy("https://api.example.org")).toBe(fromNginx);
  });

  it("sends the other security headers of the nginx config", () => {
    const file = pagesHeaders("https://api.example.org");

    for (const name of ["X-Content-Type-Options", "Referrer-Policy"]) {
      expect(file).toContain(`${name}: ${nginxHeader(name)}`);
    }
  });

  it("caches the built files for good and only those", () => {
    const file = pagesHeaders("https://api.example.org");

    expect(file).toMatch(
      /\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/,
    );
    expect(file.split("/*\n")[1]).not.toContain("Cache-Control");
  });
});
