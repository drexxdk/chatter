import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchLegal: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
}));

vi.mock("./payloadClient.js", () => ({ fetchLegal: mocks.fetchLegal }));
vi.mock("./redis.js", () => ({
  redis: { set: mocks.set, get: mocks.get },
}));

const { getCachedLegal, startLegalSync, toLegalContent } =
  await import("./legal.js");

// A language of a document as the admin has it: paragraphs and items as texts.
const section = (heading: string, paragraphs = "", items = "") => ({
  heading,
  paragraphs,
  items,
});

const global = (changes: Record<string, unknown> = {}) => ({
  termsVersion: "2026-10-12",
  contactEmail: "contact@example.com",
  terms: {
    title: { en: "Terms of use", da: "Brugsvilkår", de: null },
    updated: { en: "Version 1", da: "Version 1", de: null },
    sections: {
      en: [section("What it is", "One.\n\nTwo.\n", "a\n b \n\nc")],
      da: [section("Hvad det er", "Et.")],
      de: [],
    },
  },
  privacy: {
    title: { en: "Privacy policy", da: "Privatlivspolitik" },
    updated: { en: "Version 1", da: "Version 1" },
    sections: { en: [section("Who")], da: [section("Hvem")] },
  },
  ...changes,
});

beforeEach(() => {
  vi.useRealTimers();
  mocks.fetchLegal.mockReset();
  mocks.set.mockReset().mockResolvedValue("OK");
  mocks.get.mockReset().mockResolvedValue(null);
});

describe("toLegalContent", () => {
  it("splits paragraphs on blank lines and a list on lines, and trims them", () => {
    const content = toLegalContent(global());

    expect(content?.locales.en?.terms.sections).toEqual([
      {
        heading: "What it is",
        paragraphs: ["One.", "Two."],
        items: ["a", "b", "c"],
      },
    ]);
  });

  it("carries the version and the contact address", () => {
    expect(toLegalContent(global())).toMatchObject({
      version: "2026-10-12",
      contactEmail: "contact@example.com",
    });
  });

  it("keeps a language only when both documents are complete in it", () => {
    const content = toLegalContent(global());

    expect(Object.keys(content?.locales ?? {}).sort()).toEqual(["da", "en"]);
    // German has no title, no date and no sections, and so is left out rather than shown half empty.
    expect(content?.locales.de).toBeUndefined();
  });

  it("leaves out a language whose privacy policy is missing", () => {
    const content = toLegalContent(
      global({
        privacy: {
          title: { en: "Privacy policy" },
          updated: { en: "Version 1" },
          sections: { en: [section("Who")] },
        },
      }),
    );

    expect(Object.keys(content?.locales ?? {})).toEqual(["en"]);
  });

  it("ignores a section without a heading", () => {
    const content = toLegalContent(
      global({
        terms: {
          title: { en: "Terms of use" },
          updated: { en: "Version 1" },
          sections: { en: [section("  "), section("Real", "text")] },
        },
      }),
    );

    expect(content?.locales.en?.terms.sections.map((s) => s.heading)).toEqual([
      "Real",
    ]);
  });

  it.each([
    ["no version", { termsVersion: null }],
    ["no contact address", { contactEmail: " " }],
    [
      "no language complete",
      {
        terms: { title: { en: "Terms" } },
        privacy: null,
      },
    ],
  ])("is nothing for %s", (_label, changes) => {
    expect(toLegalContent(global(changes))).toBeUndefined();
  });
});

describe("getCachedLegal", () => {
  it("returns what was cached, or nothing", async () => {
    expect(await getCachedLegal()).toBeUndefined();

    mocks.get.mockResolvedValue(JSON.stringify({ version: "v" }));
    expect(await getCachedLegal()).toEqual({ version: "v" });
  });
});

describe("startLegalSync", () => {
  it("caches the published text, with no expiry", async () => {
    mocks.fetchLegal.mockResolvedValue(global());
    const timer = startLegalSync();
    await vi.waitFor(() => expect(mocks.set).toHaveBeenCalledTimes(1));
    clearInterval(timer);

    expect(mocks.set.mock.calls[0][0]).toBe("chatter:legal");
    expect(mocks.set.mock.calls[0]).toHaveLength(2);
    expect(JSON.parse(mocks.set.mock.calls[0][1] as string)).toMatchObject({
      version: "2026-10-12",
    });
  });

  it("keeps what is cached when there is nothing written yet", async () => {
    mocks.fetchLegal.mockResolvedValue({});
    const timer = startLegalSync();
    await vi.waitFor(() => expect(mocks.fetchLegal).toHaveBeenCalled());
    clearInterval(timer);

    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("logs a failure and keeps the last copy", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fetchLegal.mockRejectedValue(new Error("admin down"));
    const timer = startLegalSync();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    clearInterval(timer);

    expect(mocks.set).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
