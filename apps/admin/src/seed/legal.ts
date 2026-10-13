import type { Payload } from 'payload'

import { da } from './legal/da'
import { de } from './legal/de'
import { en } from './legal/en'
import type { LegalDocument, LegalTexts } from './legal/types'

const LOCALES = ['en', 'da', 'de'] as const
const TEXTS: Record<(typeof LOCALES)[number], LegalTexts> = { en, da, de }

// The version the first terms carry; people who accepted another one are asked again.
export const SEED_TERMS_VERSION = '2026-10-13'
export const SEED_CONTACT_EMAIL = 'draxxdk@gmail.com'

// The admin edits paragraphs as one text with blank lines between them, and a list as one item to a line.
const asFields = (document: LegalDocument, updated: string) => ({
  title: document.title,
  updated,
  sections: document.sections.map((section) => ({
    heading: section.heading,
    paragraphs: (section.paragraphs ?? []).join('\n\n'),
    items: (section.items ?? []).join('\n'),
  })),
})

// Fills the terms and the privacy policy in all three languages, published, unless they have been filled in already:
// what an editor wrote is never overwritten.
export async function seedLegal(payload: Payload): Promise<void> {
  const current = await payload.findGlobal({ slug: 'legal', locale: 'en', depth: 0 })

  if (current.terms?.title) {
    payload.logger.info('Terms and privacy already exist, skipping.')
    return
  }

  for (const locale of LOCALES) {
    const texts = TEXTS[locale]

    await payload.updateGlobal({
      slug: 'legal',
      locale,
      depth: 0,
      data: {
        ...(locale === 'en'
          ? { termsVersion: SEED_TERMS_VERSION, contactEmail: SEED_CONTACT_EMAIL }
          : {}),
        terms: asFields(texts.terms, texts.updated),
        privacy: asFields(texts.privacy, texts.updated),
        _status: 'published',
      },
    })
  }

  payload.logger.info('Created the terms and the privacy policy (English, Danish, German).')
}
