import crypto from "crypto";

import { env } from "./env.js";
import { NICKNAME_PATTERN } from "./limits.js";

// Returns the trimmed nickname, or null if it's missing or not allowed.
export function validateNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const nickname = raw.trim();
  return NICKNAME_PATTERN.test(nickname) ? nickname : null;
}

// Salted so the ban list in Payload never contains raw IP addresses.
export function hashIdentifier(ip: string): string {
  return crypto
    .createHash("sha256")
    .update(`${env.BAN_HASH_SALT}:${ip}`)
    .digest("hex");
}

interface HandshakeLike {
  address: string;
  headers: Record<string, string | string[] | undefined>;
}

// With `trustedProxyHops` proxies in front of the server, each appends the address it saw to X-Forwarded-For, so the
// real client is that many entries from the right. Anything further left was supplied by the client and can be forged.
// With none trusted the header is ignored, and a missing or too-short header falls back to the socket address.
export function getClientIp(
  handshake: HandshakeLike,
  trustedProxyHops: number,
): string {
  if (trustedProxyHops <= 0) return handshake.address;

  const header = handshake.headers["x-forwarded-for"];
  const entries = (Array.isArray(header) ? header.join(",") : (header ?? ""))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length >= trustedProxyHops
    ? (entries[entries.length - trustedProxyHops] ?? handshake.address)
    : handshake.address;
}
