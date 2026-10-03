import { parseEnv } from './envSchema'

// Next, the payload CLI, Playwright and Vitest all load the .env file before this module runs.
export const env = parseEnv(process.env)
