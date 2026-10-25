import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";

import {
  legalDocumentFields,
  SEED_TERMS_VERSION,
} from "../apps/admin/src/seed/legal.ts";
import { en } from "../apps/admin/src/seed/legal/en.ts";
import { da } from "../apps/admin/src/seed/legal/da.ts";
import { de } from "../apps/admin/src/seed/legal/de.ts";

const targets = {
  "--local": { base: "http://localhost:3000", env: "apps/admin/.env" },
  "--live": {
    base: "https://chatter-drexx-admin.duckdns.org",
    env: "deploy/seed.env",
  },
};
const selected = Object.keys(targets).filter((flag) =>
  process.argv.includes(flag),
);
assert.equal(selected.length, 1, "Choose exactly one of --local or --live.");
const target = targets[selected[0]];
const publish = process.argv.includes("--publish");
const credentials = parse(readFileSync(target.env));
const email = process.env.LEGAL_ADMIN_EMAIL || credentials.SEED_ADMIN_EMAIL;
const password =
  process.env.LEGAL_ADMIN_PASSWORD || credentials.SEED_ADMIN_PASSWORD;
assert.ok(email && password, "CMS administrator credentials are required.");

async function request(path, options = {}) {
  const response = await fetch(`${target.base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`CMS request failed (${response.status}): ${path}`);
  return response.json();
}

const { token } = await request("/api/admins/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
assert.ok(token, "CMS sign-in did not return a token.");
const headers = {
  Authorization: `JWT ${token}`,
  "Content-Type": "application/json",
};
const read = (locale, draft) =>
  request(
    `/api/globals/legal?locale=${locale}&depth=0&draft=${draft}&fallback-locale=none`,
    {
      headers,
    },
  );
const write = (locale, data, draft) =>
  request(`/api/globals/legal?locale=${locale}&depth=0&draft=${draft}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
const content = ({ termsVersion, contactEmail, terms, privacy }) => ({
  termsVersion,
  contactEmail,
  terms,
  privacy,
});
const current = await read("all", false);
const draft = await read("all", true);
assert.deepEqual(
  content(draft),
  content(current),
  "Unpublished edits exist; review them first.",
);
console.log(
  `${selected[0]}: current ${current.termsVersion}; proposed ${SEED_TERMS_VERSION}.`,
);

if (publish) {
  const backup = join(
    mkdtempSync(join(tmpdir(), "chatter-legal-")),
    "before.json",
  );
  writeFileSync(
    backup,
    JSON.stringify({ base: target.base, current, draft }, null, 2),
    {
      mode: 0o600,
    },
  );
  console.log(`Saved legal-text backup: ${backup}`);
  assert.deepEqual(
    content(await read("all", false)),
    content(current),
    "Published text changed during preparation.",
  );
  assert.deepEqual(
    content(await read("all", true)),
    content(draft),
    "Draft text changed during preparation.",
  );

  for (const [locale, texts] of Object.entries({ en, da, de })) {
    await write(
      locale,
      {
        terms: legalDocumentFields(texts.terms, texts.updated),
        privacy: legalDocumentFields(texts.privacy, texts.updated),
        _status: "draft",
      },
      true,
    );
  }
  await write(
    "en",
    { termsVersion: SEED_TERMS_VERSION, _status: "published" },
    false,
  );

  for (const [locale, texts] of Object.entries({ en, da, de })) {
    const saved = await read(locale, false);
    assert.equal(saved.termsVersion, SEED_TERMS_VERSION);
    assert.equal(saved.contactEmail, current.contactEmail);
    for (const name of ["terms", "privacy"]) {
      const document = saved[name];
      assert.deepEqual(
        {
          title: document.title,
          updated: document.updated,
          sections: document.sections.map(({ heading, paragraphs, items }) => ({
            heading,
            paragraphs,
            items,
          })),
        },
        legalDocumentFields(texts[name], texts.updated),
      );
    }
  }
  console.log(
    `Published and verified ${SEED_TERMS_VERSION} in en, da and de; contact preserved.`,
  );
} else {
  console.log("Preflight only. Add --publish to update the legal global.");
}
