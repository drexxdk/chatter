import type { CollectionConfig } from 'payload'

export const MemberProviderLinks: CollectionConfig = {
  slug: 'member-provider-links',
  admin: { hidden: true },
  access: {
    read: ({ req }) => req.user?.role === 'service',
    create: ({ req }) => req.user?.role === 'service',
    update: () => false,
    delete: ({ req }) => req.user?.role === 'service',
  },
  fields: [
    { name: 'identity', type: 'text', required: true, unique: true },
    { name: 'provider', type: 'text', required: true },
    { name: 'member', type: 'relationship', relationTo: 'users', required: true },
  ],
}
