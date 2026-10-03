import type { CollectionConfig } from 'payload'

// Only super-admins may open the Admin Panel or manage other admin accounts;
// service accounts exist solely so chat-server can authenticate with an API key.
export const Admins: CollectionConfig = {
  slug: 'admins',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600 * 1000,
    useAPIKey: true,
  },
  access: {
    admin: ({ req }) => req.user?.role === 'super-admin',
    create: ({ req }) => req.user?.role === 'super-admin',
    update: ({ req }) => req.user?.role === 'super-admin',
    delete: ({ req }) => req.user?.role === 'super-admin',
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'super-admin',
      options: [
        { label: 'Super Admin', value: 'super-admin' },
        { label: 'Service Account', value: 'service' },
      ],
    },
  ],
}
