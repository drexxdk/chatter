import type { Field, GlobalConfig } from 'payload'

// One document (the terms, or the privacy policy). Everything a reader sees is localized, so each language keeps its own
// wording and its own sections; the web client shows the language the visitor picked and falls back to English.
const documentFields: Field[] = [
  {
    name: 'title',
    type: 'text',
    required: true,
    localized: true,
  },
  {
    name: 'updated',
    type: 'text',
    required: true,
    localized: true,
    admin: {
      description:
        'The date of this version as shown at the top, for example "Version of 12 October 2026".',
    },
  },
  {
    name: 'sections',
    type: 'array',
    required: true,
    minRows: 1,
    localized: true,
    labels: { singular: 'Section', plural: 'Sections' },
    admin: { initCollapsed: true },
    fields: [
      { name: 'heading', type: 'text', required: true },
      {
        name: 'paragraphs',
        type: 'textarea',
        admin: {
          description:
            'Separate paragraphs with a blank line. Write {contact} where the contact address should appear.',
        },
      },
      {
        name: 'items',
        type: 'textarea',
        admin: { description: 'A list after the paragraphs: one item per line.' },
      },
    ],
  },
]

// The terms of use and the privacy policy, shown at /terms and /privacy. The chat-server copies them (every 30 seconds) and
// serves them to the web client, so a change is live shortly after it is published and the pages keep working if this
// admin is down. Every published version is kept in the version history.
export const Legal: GlobalConfig = {
  slug: 'legal',
  label: 'Terms and privacy',
  access: {
    // The published text is public; drafts and the version history are not.
    read: () => true,
    update: ({ req }) => req.user?.role === 'super-admin',
  },
  versions: { max: 100, drafts: true },
  fields: [
    {
      name: 'termsVersion',
      type: 'text',
      required: true,
      admin: {
        description:
          'Change this (a date works well) when the documents change in a way that matters: everybody is then asked to accept them again before they chat. Leave it alone for typo fixes.',
      },
    },
    {
      name: 'contactEmail',
      type: 'email',
      required: true,
      admin: {
        description:
          'The address named in both documents, for questions, reports and requests. It replaces {contact} in the text.',
      },
    },
    { name: 'terms', type: 'group', label: 'Terms of use', fields: documentFields },
    { name: 'privacy', type: 'group', label: 'Privacy policy', fields: documentFields },
  ],
}
