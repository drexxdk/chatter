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

// What a ban names to reach an account, the way an address hash reaches a guest: the account's messages and reports
// carry it, so a super-admin copies it into Bans like any other. The prefix keeps it apart from any address.
export function hashMember(userId: number): string {
  return hashIdentifier(`user:${userId}`);
}

// The guest id an account always has, so private conversations and blocks carry on from one visit to the next. Derived
// with the salt, so the id says nothing about how many accounts there are.
export function memberGuestId(userId: number): string {
  return `m-${crypto
    .createHmac("sha256", env.BAN_HASH_SALT)
    .update(`member:${userId}`)
    .digest("hex")
    .slice(0, 32)}`;
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
