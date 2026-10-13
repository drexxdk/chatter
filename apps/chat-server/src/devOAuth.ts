import crypto from "crypto";

import express from "express";

import { env } from "./env.js";
import { redirectUri } from "./oauth.js";

// A stand-in for Google, Facebook and Discord, for development and the browser tests: a page with one box asks who is
// signing in, and the rest is the real flow. Only mounted when DEV_OAUTH is on, which the server refuses in production.
const CODE_TTL_MS = 60_000;

interface Grant {
  user: string;
  challenge: string;
  exp: number;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] as string,
  );

const field = (value: unknown) =>
  typeof value === "string" && value.length <= 500 ? value : "";

export function createDevOAuthRouter(): express.Router {
  const router = express.Router();
  const codes = new Map<string, Grant>();
  const tokens = new Map<string, string>();

  router.get("/dev-oauth/authorize", (req, res) => {
    const hidden = ["state", "code_challenge"]
      .map(
        (name) =>
          `<input type="hidden" name="${name}" value="${escapeHtml(field(req.query[name]))}">`,
      )
      .join("");

    // Submitting the form ends, after the redirects, on the web client, which the server's own policy would refuse.
    res
      .set(
        "Content-Security-Policy",
        `default-src 'none'; form-action 'self' ${env.WEB_ORIGIN}`,
      )
      .type("html")
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dev sign-in</title></head><body>` +
          `<h1>Dev sign-in</h1><form method="post" action="/dev-oauth/authorize">${hidden}` +
          `<label>Who are you? <input name="user" maxlength="40" required autofocus></label> ` +
          `<button type="submit">Sign in</button></form></body></html>`,
      );
  });

  router.post(
    "/dev-oauth/authorize",
    express.urlencoded({ extended: false, limit: "2kb" }),
    (req, res) => {
      const user = field(req.body?.user).trim();

      if (!user) return res.status(400).send("A name is needed.");

      const code = crypto.randomBytes(16).toString("hex");
      codes.set(code, {
        user,
        challenge: field(req.body?.code_challenge),
        exp: Date.now() + CODE_TTL_MS,
      });

      const target = new URL(redirectUri("dev"));
      target.searchParams.set("code", code);
      target.searchParams.set("state", field(req.body?.state));

      res.redirect(target.toString());
    },
  );

  router.post(
    "/dev-oauth/token",
    express.urlencoded({ extended: false, limit: "2kb" }),
    (req, res) => {
      const grant = codes.get(field(req.body?.code));
      codes.delete(field(req.body?.code));

      const verifier = field(req.body?.code_verifier);
      const challenge = crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");

      if (
        !grant ||
        grant.exp < Date.now() ||
        grant.challenge !== challenge ||
        field(req.body?.client_secret) !== "dev"
      ) {
        return res.status(400).json({ error: "invalid_grant" });
      }

      const token = crypto.randomBytes(16).toString("hex");
      tokens.set(token, grant.user);

      res.json({ access_token: token, token_type: "Bearer" });
    },
  );

  router.get("/dev-oauth/userinfo", (req, res) => {
    const header = req.get("authorization") ?? "";
    const user = tokens.get(header.replace(/^Bearer /, ""));

    if (!user) return res.status(401).json({ error: "invalid_token" });

    res.json({
      id: `dev-${user.toLowerCase()}`,
      email: `${user}@dev.test`,
      name: user,
    });
  });

  return router;
}
