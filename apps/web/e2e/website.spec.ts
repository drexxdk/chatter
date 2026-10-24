import { expect, test } from "@playwright/test";
import type { WebsiteContent } from "../../../shared/websiteContent.mjs";
import { CHAT_SERVER_URL } from "./constants";
import { PayloadApi } from "./payload";

const payload = new PayloadApi();
const suffix = Date.now();
const version = `0.0.${suffix}`;
const futureVersion = `0.1.${suffix}`;
const draftVersion = `0.2.${suffix}`;
const key = `e2e-roadmap-${suffix}`;
const title = `E2E roadmap ${suffix}`;
const entries: number[] = [];
const releases: number[] = [];

test.beforeAll(async () => {
  await payload.login();
  for (const [releaseVersion, published, releasedAt] of [
    [version, true, "2000-01-01T00:00:00.000Z"],
    [futureVersion, true, "2099-01-01T00:00:00.000Z"],
    [draftVersion, false, "2000-01-01T00:00:00.000Z"],
  ] as const) {
    releases.push(
      await payload.createWebsiteEntry("releases", {
        version: releaseVersion,
        published,
        releasedAt,
        title: "E2E release",
        summary: "A published CMS changelog.",
        changes: "First change\nSecond change",
      }),
    );
  }
  for (const [itemKey, published, release] of [
    [key, true, releases[0]],
    [`${key}-draft`, false, releases[0]],
    [`${key}-future`, true, releases[1]],
  ] as const) {
    entries.push(
      await payload.createWebsiteEntry("roadmap-items", {
        key: itemKey,
        title: itemKey === key ? title : itemKey,
        description: "Public content from Payload.",
        status: "done",
        priority: "low",
        category: "engineering",
        order: 1000,
        published,
        release,
      }),
    );
  }
  await expect
    .poll(
      async () => {
        const response = await fetch(`${CHAT_SERVER_URL}/website`);
        if (!response.ok) return false;
        const content = (await response.json()) as WebsiteContent;
        return content.roadmap.some((item) => item.key === key);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

test.afterAll(async () => {
  for (const id of entries) await payload.remove("roadmap-items", id);
  for (const id of releases) await payload.remove("releases", id);
});

test("public website excludes drafts, future releases, and their relationship links", async ({
  request,
}) => {
  const response = await request.get(`${CHAT_SERVER_URL}/website`);
  expect(response.ok()).toBe(true);
  const content = (await response.json()) as WebsiteContent;
  expect(content.releases.some((release) => release.version === version)).toBe(
    true,
  );
  expect(
    content.releases.some(
      (release) =>
        release.version === futureVersion || release.version === draftVersion,
    ),
  ).toBe(false);
  expect(content.roadmap.some((item) => item.key === `${key}-draft`)).toBe(
    false,
  );
  expect(
    content.roadmap.find((item) => item.key === `${key}-future`)?.release,
  ).toBeUndefined();
});

for (const width of [1280, 375, 320]) {
  test(`short website pages keep their footer at the bottom at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/website", (route) =>
      route.fulfill({ json: { roadmap: [], releases: [] } }),
    );
    for (const path of ["versions", "roadmap"]) {
      await page.goto(`/${path}`);
      await expect(
        page.getByText(
          path === "versions"
            ? "No releases have been published yet."
            : "No roadmap items have been published yet.",
        ),
      ).toBeVisible();
      const layout = await page.locator("main footer").evaluate((element) => ({
        bottom: element.getBoundingClientRect().bottom,
        expected:
          innerHeight -
          parseFloat(getComputedStyle(element.closest("main")!).paddingBottom),
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
      }));
      expect(layout.bottom).toBeCloseTo(layout.expected, 0);
      expect(layout.documentHeight).toBeLessThanOrEqual(
        layout.viewportHeight + 1,
      );
    }
  });

  test(`roadmap search, keyboard filters, release links and layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/roadmap");
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const footer = await page.locator("main footer").boundingBox();
    const lastItem = await page
      .locator("main ol.divide-y > li")
      .last()
      .boundingBox();
    expect(footer!.y).toBeGreaterThanOrEqual(lastItem!.y + lastItem!.height);
    await expect(page.locator("main footer")).toHaveCSS("position", "static");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`roadmap-${width}.png`),
    });
    await page.getByRole("searchbox", { name: "Search roadmap" }).fill(title);
    await page.getByRole("button", { name: "Filter by status" }).click();
    await page.getByRole("option", { name: "Done", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("searchbox")).toHaveValue(title);
    await expect(
      page.getByRole("button", { name: "Filter by status" }),
    ).toHaveText("Done");
    await page.locator("main").evaluate(async (element) => {
      await Promise.allSettled(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      );
    });
    await page
      .getByRole("button", { name: "Filter by priority" })
      .press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Filter by priority" }),
    ).toHaveText("Low priority");
    await page.getByRole("link", { name: `v${version}`, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `v${version}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Second change", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", { includeHidden: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`versions-${width}.png`),
    });
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeInViewport();
    await page.goto(`/roadmap#${key}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeInViewport();
  });
}
