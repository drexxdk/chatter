import 'dotenv/config'
import crypto from 'crypto'
import { getPayload } from 'payload'

import config from '../payload.config'
import { parseSeedEnv } from '../envSchema'

const SAMPLE_ROOMS = [
  {
    name: 'General',
    slug: 'general',
    maxMembers: 100,
    description: 'Open chat for anything and everything.',
  },
  {
    name: 'Random',
    slug: 'random',
    maxMembers: 50,
    description: 'Off-topic chatter, memes, and tangents.',
  },
  {
    name: 'Tech Talk',
    slug: 'tech-talk',
    maxMembers: 50,
    description: 'Programming, gadgets, and tech news.',
  },
  {
    name: 'Gaming',
    slug: 'gaming',
    maxMembers: 50,
    description: 'Find teammates and talk about games.',
  },
  {
    name: 'Music',
    slug: 'music',
    maxMembers: 30,
    description: 'Share and discuss music of all genres.',
  },
]

// One-time bootstrap: creates the first super-admin and sample public rooms if they don't exist yet.
async function seed() {
  const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password } = parseSeedEnv(process.env)

  const payload = await getPayload({ config })

  const existingAdmins = await payload.count({ collection: 'admins' })

  if (existingAdmins.totalDocs > 0) {
    payload.logger.info('Admins already exist, skipping admin seed.')
  } else {
    await payload.create({
      collection: 'admins',
      data: {
        email,
        password,
        role: 'super-admin',
      },
    })

    payload.logger.info(`Created first super-admin: ${email}`)
  }

  const existingRooms = await payload.count({ collection: 'public-rooms' })

  if (existingRooms.totalDocs > 0) {
    payload.logger.info('Public rooms already exist, skipping room seed.')
  } else {
    for (const room of SAMPLE_ROOMS) {
      await payload.create({ collection: 'public-rooms', data: room })
    }

    payload.logger.info(`Created ${SAMPLE_ROOMS.length} sample public rooms.`)
  }

  const existingService = await payload.count({
    collection: 'admins',
    where: { role: { equals: 'service' } },
  })

  if (existingService.totalDocs > 0) {
    payload.logger.info('Service account already exists, skipping.')
  } else {
    const apiKey = crypto.randomBytes(32).toString('hex')

    await payload.create({
      collection: 'admins',
      data: {
        email: 'chat-server@chatter.local',
        // Unused for API-key auth, but the field is required by the auth collection.
        password: crypto.randomBytes(16).toString('hex'),
        role: 'service',
        enableAPIKey: true,
        apiKey,
      },
    })

    payload.logger.info('Created chat-server service account.')
    payload.logger.info(`Set this as PAYLOAD_SERVICE_API_KEY in apps/chat-server/.env: ${apiKey}`)
  }

  process.exit(0)
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
