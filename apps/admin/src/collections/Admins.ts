import type { CollectionConfig } from 'payload'

// Same shape as the nickname rule in chat-server, so a moderator's name looks like any other name in the chat.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u

// Only super-admins may open the Admin Panel or manage other admin accounts.
// Moderators sign in to the chat (never the panel) and may read only their own account.
// Service accounts exist solely so chat-server can authenticate with an API key.
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
    read: ({ req }) => {
      const user = req.user

      if (!user) return false
      if (user.role === 'super-admin' || user.role === 'service') return true

      return { id: { equals: user.id } }
    },
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
        { label: 'Moderator', value: 'moderator' },
        { label: 'Service Account', value: 'service' },
      ],
    },
    {
      name: 'displayName',
      type: 'text',
      unique: true,
      admin: {
        description:
          'The name shown in the chat when this account moderates. Required for moderators; guests cannot take it. 2-24 letters, numbers, spaces, or _ . -',
      },
      validate: (
        value: string | null | undefined,
        { siblingData }: { siblingData: { role?: string } },
      ) => {
        if (!value) {
          return siblingData?.role === 'moderator' ? 'A moderator needs a display name.' : true
        }

        return DISPLAY_NAME_PATTERN.test(value)
          ? true
          : 'Use 2-24 letters, numbers, spaces, or _ . -'
      },
    },
  ],
}
