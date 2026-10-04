import type { CollectionConfig } from 'payload'

// The chat-server rejects a rooms response it cannot read, so these must be whole numbers of 1 or more.
const wholeNumberFrom1 = (value: unknown) =>
  value == null ||
  (typeof value === 'number' && Number.isInteger(value) && value >= 1) ||
  'Use a whole number of 1 or more, or leave the field empty.'

// Curated by super-admins; read via API key by chat-server, never exposed to the public directly.
export const PublicRooms: CollectionConfig = {
  slug: 'public-rooms',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    // Public endpoint: the web lobby lists rooms without authenticating.
    read: () => true,
    create: ({ req }) => req.user?.role === 'super-admin',
    update: ({ req }) => req.user?.role === 'super-admin',
    delete: ({ req }) => req.user?.role === 'super-admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'maxMembers',
      type: 'number',
      min: 1,
      validate: wholeNumberFrom1,
      admin: {
        description: 'Leave empty for no limit.',
      },
    },
    {
      name: 'slowModeSeconds',
      type: 'number',
      min: 1,
      defaultValue: 10,
      validate: wholeNumberFrom1,
      admin: {
        description:
          'Seconds a guest must wait between messages. Leave empty to apply only the general flood limit (5 messages per 5 seconds).',
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
