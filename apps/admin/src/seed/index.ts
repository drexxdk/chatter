import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'

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
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to seed the first admin.')
  }

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

  process.exit(0)
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
