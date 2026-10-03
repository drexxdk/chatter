import { describe, expect, it } from 'vitest'

import { parseEnv, parseSeedEnv } from '../../src/envSchema'

const VALID = {
  DATABASE_URL: 'postgres://chatter:pw@127.0.0.1:5432/chatter',
  PAYLOAD_SECRET: 'a-secret-of-at-least-16',
}

describe('parseEnv', () => {
  it('reads valid settings', () => {
    expect(parseEnv(VALID)).toEqual(VALID)
  })

  it('accepts the postgresql:// scheme', () => {
    const url = 'postgresql://chatter:pw@db.example.com/chatter'

    expect(parseEnv({ ...VALID, DATABASE_URL: url }).DATABASE_URL).toBe(url)
  })

  it('ignores variables it does not know', () => {
    expect(() => parseEnv({ ...VALID, PATH: '/usr/bin' })).not.toThrow()
  })

  it('reports every missing variable at once', () => {
    expect(() => parseEnv({})).toThrow(
      /DATABASE_URL: is required[\s\S]*PAYLOAD_SECRET: is required/,
    )
  })

  // Payload used to start with an empty secret when this was unset.
  it.each(['', '   ', undefined])('treats %j as missing', (blank) => {
    expect(() => parseEnv({ ...VALID, PAYLOAD_SECRET: blank })).toThrow(
      /PAYLOAD_SECRET: is required/,
    )
  })

  it.each([
    ['a different database', 'mysql://localhost/chatter'],
    ['no scheme', '127.0.0.1:5432/chatter'],
    ['nonsense', 'nope'],
  ])('rejects a DATABASE_URL with %s without printing it', (_label, value) => {
    expect(() => parseEnv({ ...VALID, DATABASE_URL: value })).toThrow(
      /DATABASE_URL: must be a postgres/,
    )

    try {
      parseEnv({ ...VALID, DATABASE_URL: value })
    } catch (error) {
      expect((error as Error).message).not.toContain(value)
    }
  })

  it('rejects a short secret without printing it', () => {
    const secret = 'too-short'

    expect(() => parseEnv({ ...VALID, PAYLOAD_SECRET: secret })).toThrow(
      /PAYLOAD_SECRET: .*at least 16 characters/,
    )

    try {
      parseEnv({ ...VALID, PAYLOAD_SECRET: secret })
    } catch (error) {
      expect((error as Error).message).not.toContain(secret)
    }
  })

  // The value shipped in .env.example is long enough to pass the length check, so it is refused by name.
  it('rejects the placeholder from .env.example', () => {
    expect(() => parseEnv({ ...VALID, PAYLOAD_SECRET: 'YOUR_SECRET_HERE' })).toThrow(
      /PAYLOAD_SECRET: .*placeholder/,
    )
  })

  it('lists every invalid setting in one error', () => {
    const run = () => parseEnv({ DATABASE_URL: 'nope', PAYLOAD_SECRET: 'x' })

    expect(run).toThrow(/DATABASE_URL: /)
    expect(run).toThrow(/PAYLOAD_SECRET: /)
  })
})

describe('parseSeedEnv', () => {
  it('reads the admin login', () => {
    expect(
      parseSeedEnv({ SEED_ADMIN_EMAIL: 'admin@example.com', SEED_ADMIN_PASSWORD: 'secret' }),
    ).toEqual({
      SEED_ADMIN_EMAIL: 'admin@example.com',
      SEED_ADMIN_PASSWORD: 'secret',
    })
  })

  it('requires both, naming them', () => {
    expect(() => parseSeedEnv({})).toThrow(
      /SEED_ADMIN_EMAIL: is required[\s\S]*SEED_ADMIN_PASSWORD: is required/,
    )
  })

  it('rejects a malformed email', () => {
    expect(() =>
      parseSeedEnv({ SEED_ADMIN_EMAIL: 'admin', SEED_ADMIN_PASSWORD: 'secret' }),
    ).toThrow(/SEED_ADMIN_EMAIL: must be an email address/)
  })
})
