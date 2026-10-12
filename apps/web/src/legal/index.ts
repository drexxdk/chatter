// The terms of use and the privacy policy as the chat-server serves them (`GET /legal`, see its README): written in the
// admin's "Terms and privacy", in every language that has both documents.

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  items: string[];
}

export interface LegalDocumentText {
  title: string;
  updated: string;
  sections: LegalSection[];
}

export interface LegalContent {
  // Changes when the documents change in a way that matters: everybody is then asked to accept them again.
  version: string;
  contactEmail: string;
  locales: Record<
    string,
    { terms: LegalDocumentText; privacy: LegalDocumentText }
  >;
}

export type LegalPageName = "terms" | "privacy";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function parseDocument(value: unknown): LegalDocumentText | undefined {
  if (!isRecord(value)) return undefined;
  const { title, updated, sections } = value;

  if (
    typeof title !== "string" ||
    typeof updated !== "string" ||
    !Array.isArray(sections)
  ) {
    return undefined;
  }

  const parsed = sections.flatMap((section): LegalSection[] =>
    isRecord(section) && typeof section.heading === "string"
      ? [
          {
            heading: section.heading,
            paragraphs: strings(section.paragraphs),
            items: strings(section.items),
          },
        ]
      : [],
  );

  return parsed.length > 0 ? { title, updated, sections: parsed } : undefined;
}

// What the server sent, or nothing when it is not the shape the pages need: a page that cannot be shown whole is not
// shown half.
export function parseLegal(value: unknown): LegalContent | undefined {
  if (!isRecord(value) || !isRecord(value.locales)) return undefined;
  const { version, contactEmail } = value;

  if (typeof version !== "string" || typeof contactEmail !== "string") {
    return undefined;
  }

  const locales: LegalContent["locales"] = {};

  for (const [code, pair] of Object.entries(value.locales)) {
    if (!isRecord(pair)) continue;
    const terms = parseDocument(pair.terms);
    const privacy = parseDocument(pair.privacy);
    if (terms && privacy) locales[code] = { terms, privacy };
  }

  return Object.keys(locales).length > 0
    ? { version, contactEmail, locales }
    : undefined;
}

// The documents in the guest's language, in English where there are none, or in whatever language there is.
export function legalIn(
  content: LegalContent,
  language: string | undefined,
): LegalContent["locales"][string] {
  return (
    content.locales[language ?? "en"] ??
    content.locales.en ??
    // parseLegal keeps content only when there is at least one language.
    Object.values(content.locales)[0]!
  );
}

// A paragraph as pieces: text, and the contact address wherever the document names it.
export function withContact(
  text: string,
  contactEmail: string,
): ({ text: string } | { contact: string })[] {
  return text
    .split("{contact}")
    .flatMap((part, index) =>
      index === 0
        ? [{ text: part }]
        : [{ contact: contactEmail }, { text: part }],
    )
    .filter((piece) => !("text" in piece) || piece.text !== "");
}
