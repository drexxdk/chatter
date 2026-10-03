import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'

// One-time bootstrap: creates the first super-admin if the admins collection is empty.
async function seed() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to seed the first admin.')
  }

  const payload = await getPayload({ config })

  const existing = await payload.count({ collection: 'admins' })

  if (existing.totalDocs > 0) {
    payload.logger.info('Admins already exist, skipping seed.')
    process.exit(0)
  }

  await payload.create({
    collection: 'admins',
    data: {
      email,
      password,
      role: 'super-admin',
    },
  })

  payload.logger.info(`Created first super-admin: ${email}`)
  process.exit(0)
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
