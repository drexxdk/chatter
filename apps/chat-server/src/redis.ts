import { Redis } from 'ioredis'

import { env } from './env.js'

// ioredis clients aren't safe to share between normal commands and pub/sub subscriptions.
export const redis = new Redis(env.REDIS_URL)
export const pubClient = new Redis(env.REDIS_URL)
export const subClient = pubClient.duplicate()
