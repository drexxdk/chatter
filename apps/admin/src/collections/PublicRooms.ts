import type { CollectionConfig } from 'payload'

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
      required: true,
      min: 1,
      defaultValue: 50,
    },
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
