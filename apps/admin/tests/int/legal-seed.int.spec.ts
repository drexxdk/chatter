import { describe, expect, it } from 'vitest'

import { da } from '@/seed/legal/da'
import { de } from '@/seed/legal/de'
import { en } from '@/seed/legal/en'

const languages = { en, da, de }

describe('the seeded terms and privacy policy', () => {
  it.each(['terms', 'privacy'] as const)(
    '%s have the same sections and lists in every language',
    (name) => {
      const shape = (texts: typeof en) =>
        texts[name].sections.map((section) => [
          section.paragraphs?.length ?? 0,
          section.items?.length ?? 0,
        ])

      expect(shape(da)).toEqual(shape(en))
      expect(shape(de)).toEqual(shape(en))
    },
  )

  it.each(Object.entries(languages))(
    '%s name the contact address, and no other placeholder',
    (_language, texts) => {
      const all = [texts.terms, texts.privacy]
        .flatMap((document) =>
          document.sections.flatMap((section) => [
            section.heading,
            ...(section.paragraphs ?? []),
            ...(section.items ?? []),
          ]),
        )
        .join(' ')

      expect(all).toContain('{contact}')
      expect(all.replaceAll('{contact}', '')).not.toMatch(/[{}]/)
      expect(texts.updated).toMatch(/2026/)
    },
  )
})
