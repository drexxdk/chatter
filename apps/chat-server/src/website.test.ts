import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fetchWebsiteContent } from "./payloadClient.js";

const request = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", request));
afterEach(() => vi.unstubAllGlobals());

const release = (
  id: number,
  published: boolean,
  releasedAt = "2026-01-01T00:00:00.000Z",
) => ({
  id,
  version: `${id}.0.0`,
  title: { en: "Release" },
  summary: { en: "Summary" },
  changes: { en: "One\nTwo" },
  published,
  releasedAt,
  internal: "secret",
});
const item = (key: string, published = true, release = 1) => ({
  key,
  title: { en: "Feature", da: null },
  description: "English fallback",
  status: "planned",
  priority: "high",
  category: "chat",
  order: 0,
  published,
  release,
  internal: "secret",
});

it("exposes only published items and shipped releases without internal fields", async () => {
  request.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => ({
      docs: url.includes("roadmap-items")
        ? [item("public"), item("draft", false), item("future-target", true, 3)]
        : [
            release(1, true),
            release(2, false),
            release(3, true, "2999-01-01T00:00:00.000Z"),
          ],
    }),
  }));
  const content = await fetchWebsiteContent();
  expect(content.roadmap.map((entry) => entry.key)).toEqual([
    "future-target",
    "public",
  ]);
  expect(content.roadmap.find((entry) => entry.key === "public")?.release).toBe(
    "1.0.0",
  );
  expect(content.roadmap[0].release).toBeUndefined();
  expect(content.releases.map((entry) => entry.version)).toEqual(["1.0.0"]);
  expect(JSON.stringify(content)).not.toContain("secret");
  expect(content.roadmap[0].description).toEqual({ en: "English fallback" });
});

it("rejects malformed CMS content instead of replacing a good cached copy", async () => {
  request.mockResolvedValue({
    ok: true,
    json: async () => ({
      docs: [item("broken", true)].map((entry) => ({
        ...entry,
        status: "unknown",
      })),
    }),
  });
  await expect(fetchWebsiteContent()).rejects.toThrow("Unexpected response");
});
