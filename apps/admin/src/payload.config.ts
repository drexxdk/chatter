import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Admins } from './collections/Admins'
import { PublicRooms } from './collections/PublicRooms'
import { Bans } from './collections/Bans'
import { Reports } from './collections/Reports'
import { Users } from './collections/Users'
import { Legal } from './globals/Legal'
import { env } from './env'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Admins.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Admins, PublicRooms, Bans, Reports, Users],
  globals: [Legal],
  // The languages of the web client; only fields marked `localized` differ between them.
  localization: {
    locales: [
      { label: 'English', code: 'en' },
      { label: 'Dansk', code: 'da' },
      { label: 'Deutsch', code: 'de' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL,
    },
    migrationDir: path.resolve(dirname, 'migrations'),
    // In production the schema only changes through migrations, which run when the app starts.
    prodMigrations: migrations,
  }),
  plugins: [],
})
