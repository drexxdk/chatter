import type { CollectionConfig } from 'payload'

export const RoadmapItems: CollectionConfig = {
  slug: 'roadmap-items',
  admin: {
    useAsTitle: 'title',
    group: 'Website',
    defaultColumns: ['title', 'status', 'priority', 'category', 'published'],
  },
  access: {
    read: ({ req }) => req.user?.role === 'super-admin' || req.user?.role === 'service',
    create: ({ req }) => req.user?.role === 'super-admin',
    update: ({ req }) => req.user?.role === 'super-admin',
    delete: ({ req }) => req.user?.role === 'super-admin',
  },
  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description:
          'Stable identifier used by links and the seed. Do not change it after publication.',
      },
    },
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'description', type: 'textarea', localized: true, required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'planned',
      options: [
        { label: 'Planned', value: 'planned' },
        { label: 'Exploring', value: 'exploring' },
        { label: 'In progress', value: 'in-progress' },
        { label: 'Done', value: 'done' },
      ],
    },
    {
      name: 'priority',
      type: 'select',
      required: true,
      defaultValue: 'medium',
      options: [
        { label: 'High', value: 'high' },
        { label: 'Medium', value: 'medium' },
        { label: 'Low', value: 'low' },
      ],
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Reliability', value: 'reliability' },
        { label: 'Chat', value: 'chat' },
        { label: 'Experience', value: 'experience' },
        { label: 'Documentation', value: 'documentation' },
        { label: 'Engineering', value: 'engineering' },
      ],
    },
    { name: 'order', type: 'number', defaultValue: 0, required: true },
    {
      name: 'release',
      type: 'relationship',
      relationTo: 'releases',
      admin: {
        description:
          'Optional target or shipped release. Unpublished releases are not shown publicly.',
      },
    },
    { name: 'published', type: 'checkbox', defaultValue: false },
  ],
}
