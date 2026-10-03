import type { CollectionConfig } from 'payload'

// Identifiers are salted hashes, not raw IPs; checked by chat-server via API key at socket handshake.
export const Bans: CollectionConfig = {
  slug: 'bans',
  admin: {
    useAsTitle: 'identifierHash',
  },
  access: {
    // Only chat-server (service API key) or a super-admin may read the ban list; never public.
    read: ({ req }) => req.user?.role === 'service' || req.user?.role === 'super-admin',
    create: ({ req }) => req.user?.role === 'super-admin',
    update: ({ req }) => req.user?.role === 'super-admin',
    delete: ({ req }) => req.user?.role === 'super-admin',
  },
  fields: [
    {
      name: 'identifierHash',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'reason',
      type: 'text',
    },
    {
      name: 'expiresAt',
      type: 'date',
      admin: {
        description: 'Leave empty for a permanent ban.',
      },
    },
  ],
}
