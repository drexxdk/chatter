import type { CollectionConfig } from 'payload'

// What the chat-server keeps of a message that guests reported, so a super-admin can judge it after the room's
// history has expired. The chat-server (service API key) writes and prunes; only super-admins read and decide.
// To ban the sender, copy `senderHash` into a new Ban.
export const Reports: CollectionConfig = {
  slug: 'reports',
  admin: {
    useAsTitle: 'messageId',
    defaultColumns: ['status', 'roomSlug', 'nickname', 'reporterCount', 'createdAt'],
    description:
      'Messages reported by guests. A message is hidden for everybody once enough different people report it. Deleted automatically after the retention period.',
  },
  access: {
    read: ({ req }) => req.user?.role === 'service' || req.user?.role === 'super-admin',
    create: ({ req }) => req.user?.role === 'service',
    update: ({ req }) => req.user?.role === 'service' || req.user?.role === 'super-admin',
    delete: ({ req }) => req.user?.role === 'service' || req.user?.role === 'super-admin',
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: [
        { label: 'Open (reported, still visible)', value: 'open' },
        { label: 'Hidden (waiting for review)', value: 'hidden' },
        { label: 'Dismissed (nothing wrong)', value: 'dismissed' },
        { label: 'Actioned (sender banned or warned)', value: 'actioned' },
      ],
    },
    {
      name: 'messageId',
      type: 'text',
      required: true,
      unique: true,
      admin: { readOnly: true },
    },
    { name: 'roomSlug', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'text',
      type: 'textarea',
      required: true,
      admin: { readOnly: true, description: 'The message as it was written.' },
    },
    { name: 'nickname', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'guestId', type: 'text', admin: { readOnly: true } },
    {
      name: 'senderHash',
      type: 'text',
      admin: {
        readOnly: true,
        description:
          "The sender's salted address hash. Copy it into Bans to ban them. Empty for a moderator's message.",
      },
    },
    {
      name: 'reporterCount',
      type: 'number',
      required: true,
      defaultValue: 1,
      admin: { readOnly: true, description: 'How many different addresses reported it.' },
    },
    {
      name: 'reasons',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Spam', value: 'spam' },
        { label: 'Harassment or hate', value: 'harassment' },
        { label: 'Sexual content', value: 'sexual' },
        { label: 'Illegal content', value: 'illegal' },
        { label: 'Something else', value: 'other' },
      ],
      admin: { readOnly: true },
    },
  ],
}
