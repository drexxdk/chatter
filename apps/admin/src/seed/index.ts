import 'dotenv/config'
import crypto from 'crypto'
import { getPayload } from 'payload'

import config from '../payload.config'
import { parseSeedEnv } from '../envSchema'
import { seedLegal } from './legal'
import { seedRoadmap } from './roadmap'

// English is the default language; `da` and `de` hold each room's name and description in those languages.
const SAMPLE_ROOMS = [
  {
    name: 'Dating',
    slug: 'dating',
    maxMembers: 100,
    description: 'Meet new people and flirt.',
    da: { name: 'Dating', description: 'Mød nye mennesker og flirt.' },
    de: { name: 'Dating', description: 'Lerne neue Leute kennen und flirte.' },
  },
  {
    name: 'General',
    slug: 'general',
    maxMembers: 100,
    description: 'Open chat for anything and everything.',
    da: { name: 'Generelt', description: 'Åben chat om alt mellem himmel og jord.' },
    de: { name: 'Allgemein', description: 'Offener Chat über alles Mögliche.' },
  },
  {
    name: 'Random',
    slug: 'random',
    maxMembers: 50,
    description: 'Off-topic chatter, memes, and tangents.',
    da: { name: 'Tilfældigt', description: 'Off-topic snak, memes og sidespring.' },
    de: { name: 'Zufällig', description: 'Offtopic-Geplauder, Memes und Abschweifungen.' },
  },
  {
    name: 'Tech Talk',
    slug: 'tech-talk',
    maxMembers: 50,
    description: 'Programming, gadgets, and tech news.',
    da: { name: 'Tech-snak', description: 'Programmering, gadgets og tech-nyheder.' },
    de: { name: 'Tech-Talk', description: 'Programmierung, Gadgets und Tech-News.' },
  },
  {
    name: 'Gaming',
    slug: 'gaming',
    maxMembers: 50,
    description: 'Find teammates and talk about games.',
    da: { name: 'Gaming', description: 'Find holdkammerater og snak om spil.' },
    de: { name: 'Gaming', description: 'Finde Mitspieler und sprich über Spiele.' },
  },
  {
    name: 'Music',
    slug: 'music',
    maxMembers: 30,
    description: 'Share and discuss music of all genres.',
    da: { name: 'Musik', description: 'Del og diskuter musik i alle genrer.' },
    de: { name: 'Musik', description: 'Teile und diskutiere Musik aller Genres.' },
  },
] as const

// One-time bootstrap: creates the first super-admin and sample public rooms if they don't exist yet.
async function seed() {
  const payload = await getPayload({ config })

  const existingAdmins = await payload.count({ collection: 'admins' })

  if (existingAdmins.totalDocs > 0) {
    payload.logger.info('Admins already exist, skipping admin seed.')
  } else {
    // Only a database without admins needs the first one's credentials (deploy/seed.env).
    const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password } = parseSeedEnv(process.env)

    await payload.create({
      collection: 'admins',
      data: {
        email,
        password,
        role: 'super-admin',
        // Without one the account cannot sign in to the chat.
        displayName: 'Admin',
      },
    })

    payload.logger.info(`Created first super-admin: ${email}`)
  }

  const existingRooms = await payload.count({ collection: 'public-rooms' })

  if (existingRooms.totalDocs > 0) {
    payload.logger.info('Public rooms already exist, skipping room seed.')
  } else {
    for (const { da, de, ...room } of SAMPLE_ROOMS) {
      const created = await payload.create({ collection: 'public-rooms', data: room })

      for (const [locale, text] of [
        ['da', da],
        ['de', de],
      ] as const) {
        await payload.update({
          collection: 'public-rooms',
          id: created.id,
          locale,
          data: text,
        })
      }
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
    payload.logger.info(
      `Set this as PAYLOAD_SERVICE_API_KEY in the chat-server's settings (apps/chat-server/.env, or deploy/chat-server.env in production): ${apiKey}`,
    )
  }

  await seedLegal(payload)
  await seedRoadmap(payload)

  process.exit(0)
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
