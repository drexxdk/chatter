import { env } from "./env.js";
import { log } from "./log.js";
import { fetchLegal, type LegalGlobal } from "./payloadClient.js";
import { redis } from "./redis.js";

const CACHE_KEY = "chatter:legal";

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

// What the web client gets: the terms and the privacy policy in each language that has both, and what is not in the text.
export interface LegalContent {
  // Changes when the documents change in a way that matters, so that everybody is asked to accept them again.
  version: string;
  contactEmail: string;
  locales: Record<
    string,
    { terms: LegalDocumentText; privacy: LegalDocumentText }
  >;
}

// The admin edits paragraphs as one text with blank lines between them, and a list as one item to a line.
const paragraphsOf = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

const itemsOf = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

function documentIn(
  source: LegalGlobal["terms"],
  locale: string,
): LegalDocumentText | undefined {
  const title = source?.title?.[locale]?.trim();
  const updated = source?.updated?.[locale]?.trim();
  const sections = (source?.sections?.[locale] ?? []).filter(
    (section) => section.heading.trim() !== "",
  );

  if (!title || !updated || sections.length === 0) return undefined;

  return {
    title,
    updated,
    sections: sections.map((section) => ({
      heading: section.heading.trim(),
      paragraphs: paragraphsOf(section.paragraphs),
      items: itemsOf(section.items),
    })),
  };
}

// Payload hands over every language of every field. A language is kept only when both documents are complete in it, so
// a half-written translation never replaces the English text a visitor would otherwise get. Nothing at all (the global
// has not been filled in or published yet) is not an error.
export function toLegalContent(source: LegalGlobal): LegalContent | undefined {
  const version = source.termsVersion?.trim();
  const contactEmail = source.contactEmail?.trim();

  if (!version || !contactEmail) return undefined;

  const codes = new Set(
    [source.terms, source.privacy].flatMap((document) =>
      Object.keys(document?.title ?? {}),
    ),
  );
  const locales: LegalContent["locales"] = {};

  for (const code of codes) {
    const terms = documentIn(source.terms, code);
    const privacy = documentIn(source.privacy, code);
    if (terms && privacy) locales[code] = { terms, privacy };
  }

  return Object.keys(locales).length === 0
    ? undefined
    : { version, contactEmail, locales };
}

async function syncLegal(): Promise<void> {
  const content = toLegalContent(await fetchLegal());

  // Not written yet: whatever was cached stays, and a fresh start serves nothing.
  if (!content) return;

  await redis.set(CACHE_KEY, JSON.stringify(content));
}

export async function getCachedLegal(): Promise<LegalContent | undefined> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as LegalContent) : undefined;
}

// Polls Payload on an interval, so the pages are served from the cache and keep working when the admin is down.
export function startLegalSync(): NodeJS.Timeout {
  const sync = () =>
    syncLegal().catch((error) => log.error("Failed to sync the terms", error));

  void sync();

  return setInterval(sync, env.SYNC_INTERVAL_MS);
}
