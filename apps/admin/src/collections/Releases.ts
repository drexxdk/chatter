import type { CollectionConfig } from 'payload'

export const Releases: CollectionConfig = {
  slug: 'releases',
  admin: {
    useAsTitle: 'version',
    group: 'Website',
    defaultColumns: ['version', 'title', 'releasedAt', 'published'],
  },
  access: {
    read: ({ req }) => req.user?.role === 'super-admin' || req.user?.role === 'service',
    create: ({ req }) => req.user?.role === 'super-admin',
    update: ({ req }) => req.user?.role === 'super-admin',
    delete: ({ req }) => req.user?.role === 'super-admin',
  },
  fields: [
    {
      name: 'version',
      type: 'text',
      required: true,
      unique: true,
      validate: (value: unknown) =>
        (typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) ||
        'Use a version such as 1.0.0 or 1.1.0-beta.1.',
    },
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'summary', type: 'textarea', localized: true, required: true },
    {
      name: 'changes',
      type: 'textarea',
      localized: true,
      required: true,
      admin: { description: 'One change per line. Only describe work included in this release.' },
    },
    {
      name: 'releasedAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Publish after deployment. Future-dated releases stay hidden until their release date.',
      },
    },
  ],
}
