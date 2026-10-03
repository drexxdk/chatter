import crypto from 'crypto'

import { env } from './env.js'

const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u

// Returns the trimmed nickname, or null if it's missing or not allowed.
export function validateNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const nickname = raw.trim()
  return NICKNAME_PATTERN.test(nickname) ? nickname : null
}

// Salted so the ban list in Payload never contains raw IP addresses.
export function hashIdentifier(ip: string): string {
  return crypto.createHash('sha256').update(`${env.BAN_HASH_SALT}:${ip}`).digest('hex')
}
