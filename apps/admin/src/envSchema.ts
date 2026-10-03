import { z } from 'zod'

// Blank counts as unset, so `FOO=` in a .env file behaves the same as leaving the line out.
const blankIsUnset = (value: unknown) => {
  if (typeof value !== 'string') return value
  return value.trim() || undefined
}

const setting = <T extends z.ZodType>(schema: T) => z.preprocess(blankIsUnset, schema)

const MIN_SECRET_LENGTH = 16
const SECRET_PLACEHOLDER = 'YOUR_SECRET_HERE'

const invalidOrMissing = (invalid: string) => (issue: { input?: unknown }) =>
  issue.input === undefined ? 'is required' : invalid

// Values are never echoed: both settings hold secrets.
const envSchema = z.object({
  DATABASE_URL: setting(
    z.url({
      protocol: /^postgres(ql)?$/,
      error: invalidOrMissing('must be a postgres:// or postgresql:// URL'),
    }),
  ),
  PAYLOAD_SECRET: setting(
    z
      .string({ error: 'is required' })
      .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`)
      .refine((value) => value !== SECRET_PLACEHOLDER, {
        error: 'is still the placeholder from .env.example',
      }),
  ),
})

// Only the one-time seed script needs these, so the app itself does not require them.
const seedSchema = z.object({
  SEED_ADMIN_EMAIL: setting(z.email({ error: invalidOrMissing('must be an email address') })),
  SEED_ADMIN_PASSWORD: setting(z.string({ error: 'is required' })),
})

type Source = Record<string, string | undefined>

function parse<T extends z.ZodType>(schema: T, source: Source): z.output<T> {
  const result = schema.safeParse(source)

  if (result.success) return result.data

  const lines = new Set(
    result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`),
  )

  throw new Error(`Invalid environment variables:\n${[...lines].join('\n')}`)
}

export const parseEnv = (source: Source) => parse(envSchema, source)

export const parseSeedEnv = (source: Source) => parse(seedSchema, source)
