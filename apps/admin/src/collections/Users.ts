import type { CollectionConfig } from 'payload'
import { parseNotificationPreferences } from '../../../../shared/notificationPreferences.mjs'

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
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data

        const nickname = data.nickname === undefined ? originalDoc?.nickname : data.nickname
        const displayName =
          data.displayName === undefined ? originalDoc?.displayName : data.displayName

        if (
          typeof nickname !== 'string' ||
          (displayName != null && typeof displayName !== 'string')
        )
          return data

        const normalize = (name: string) =>
          name
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[\s._-]+/g, '')
        const nicknameKey = normalize(nickname)
        const displayNameKey = normalize(displayName || nickname)

        return {
          ...data,
          nicknameKey,
          displayNameKey,
          nameClaims: [nicknameKey].map((key) => {
            const existing = originalDoc?.nameClaims?.find(
              (claim: { key: string; id?: string }) => claim.key === key,
            )
            return { key, ...(existing?.id ? { id: existing.id } : {}) }
          }),
        }
      },
    ],
  },
  fields: [
    {
      name: 'notificationPreferences',
      type: 'json',
      admin: { hidden: true },
      access: {
        read: ({ req }) => req.user?.role === 'service',
        create: ({ req }) => req.user?.role === 'service',
        update: ({ req }) => req.user?.role === 'service',
      },
      validate: (value: unknown) =>
        value == null ||
        parseNotificationPreferences(value) !== undefined ||
        'Invalid notification preferences.',
    },
    {
      name: 'provider',
      type: 'text',
      required: true,
      admin: { readOnly: true, description: 'google, facebook or discord.' },
    },
    { name: 'providerUserId', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'passwordHash',
      type: 'text',
      admin: { hidden: true },
      access: {
        read: ({ req }) => req.user?.role === 'service',
        create: ({ req }) => req.user?.role === 'service',
        update: ({ req }) => req.user?.role === 'service',
      },
    },
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
          'The username without case and punctuation. Derived automatically when the account is saved.',
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
      name: 'displayNameChangedAt',
      type: 'date',
      admin: { hidden: true },
      access: {
        read: ({ req }) => req.user?.role === 'service',
        create: ({ req }) => req.user?.role === 'service',
        update: ({ req }) => req.user?.role === 'service',
      },
    },
    {
      name: 'displayNameKey',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description:
          'The display name without case, spaces and punctuation. Derived automatically when the account is saved.',
      },
    },
    {
      name: 'nameClaims',
      type: 'array',
      admin: { hidden: true },
      fields: [{ name: 'key', type: 'text', required: true, unique: true }],
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
    {
      name: 'birthDate',
      type: 'text',
      minLength: 10,
      maxLength: 10,
      admin: { hidden: true },
      access: {
        read: ({ req }) => req.user?.role === 'service',
        create: ({ req }) => req.user?.role === 'service',
        update: ({ req }) => req.user?.role === 'service',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return true
        const date = new Date(`${value}T00:00:00Z`)
        return (
          (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value) ||
          'Enter a valid date of birth.'
        )
      },
    },
    { name: 'age', type: 'number', min: 18, max: 99, admin: { readOnly: true } },
    { name: 'lastLoginAt', type: 'date', admin: { readOnly: true } },
  ],
}
