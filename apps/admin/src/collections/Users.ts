import type { CollectionConfig } from 'payload'

// The people who made an account by connecting Google, Facebook or Discord. Not a Payload login: they never sign in to
// this admin, and the chat-server (service API key) is the only one that creates and updates them. Super-admins can read
// them, correct a nickname and delete an account when somebody asks for their data to be removed.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'nickname',
    defaultColumns: ['nickname', 'displayName', 'provider', 'email', 'lastLoginAt', 'createdAt'],
    description:
      'People with an account. Created by the chat-server when somebody connects a provider. To remove somebody, delete the entry.',
  },
  access: {
    read: ({ req }) => req.user?.role === 'service' || req.user?.role === 'super-admin',
    create: ({ req }) => req.user?.role === 'service',
    update: ({ req }) => req.user?.role === 'service' || req.user?.role === 'super-admin',
    delete: ({ req }) => req.user?.role === 'service' || req.user?.role === 'super-admin',
  },
  fields: [
    {
      name: 'provider',
      type: 'text',
      required: true,
      admin: { readOnly: true, description: 'google, facebook or discord.' },
    },
    { name: 'providerUserId', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'identity',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        readOnly: true,
        description: 'The provider and the id there; one account for each.',
      },
    },
    {
      name: 'email',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'As the provider gave it. Never shown to anybody in the chat.',
      },
    },
    { name: 'emailVerified', type: 'checkbox', defaultValue: false, admin: { readOnly: true } },
    {
      name: 'nickname',
      type: 'text',
      required: true,
      admin: { description: 'The username: no spaces, never shown in the chat.' },
    },
    {
      name: 'nicknameKey',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        readOnly: true,
        description:
          'The username without case and punctuation: what makes it taken. Kept up to date by the chat-server.',
      },
    },
    {
      name: 'displayName',
      type: 'text',
      admin: {
        description:
          'The name the chat shows. Empty for an account made before display names, which then shows the username.',
      },
    },
    {
      name: 'displayNameKey',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        description:
          'The display name without case, spaces and punctuation: what makes it taken. Kept up to date by the chat-server.',
      },
    },
    {
      name: 'picture',
      type: 'text',
      admin: {
        readOnly: true,
        description:
          'The picture the account is shown by: a style and a seed, like lorelei:k3j9x2ab. Drawn by the web client.',
      },
    },
    {
      name: 'avatar',
      type: 'select',
      required: true,
      defaultValue: 'other',
      options: [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' },
        { label: 'Transgender', value: 'trans' },
        { label: 'Not specified', value: 'other' },
      ],
    },
    { name: 'age', type: 'number', min: 18, max: 99 },
    { name: 'lastLoginAt', type: 'date', admin: { readOnly: true } },
  ],
}
