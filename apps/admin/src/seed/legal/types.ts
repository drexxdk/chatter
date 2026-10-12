// The text of the terms and the privacy policy, one document per language. `{contact}` stands for the contact address.
// A plain-language draft: have it read by somebody who knows the law before real users come.

export interface LegalSection {
  heading: string
  paragraphs?: string[]
  // A list after the paragraphs.
  items?: string[]
}

export interface LegalDocument {
  title: string
  sections: LegalSection[]
}

export interface LegalTexts {
  // The date of this version, as shown at the top of both documents.
  updated: string
  terms: LegalDocument
  privacy: LegalDocument
}
