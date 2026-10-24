import { expect, test } from "@playwright/test";

for (const width of [1280, 375, 320]) {
  test(`page navigation starts at the top without moving the outgoing view at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/about");
    await page
      .getByRole("link", { name: "Privacy policy", exact: true })
      .waitFor();
    await page.evaluate(async () => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const outgoing =
        document.querySelector("main div.contents")!.parentElement!;
      const trace = {
        before: outgoing.getBoundingClientRect().top,
        frames: [] as { outgoing: number; scroll: number }[],
        done: false,
      };
      Reflect.set(window, "pageTransitionScroll", trace);
      const capture = () => {
        const leaving = document.querySelector(
          'main div.contents[aria-hidden="true"]',
        )?.parentElement;
        if (leaving)
          trace.frames.push({
            outgoing: leaving.getBoundingClientRect().top,
            scroll: window.scrollY,
          });
        trace.done = !leaving && trace.frames.length > 0;
        if (!trace.done) requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
    });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await page
      .getByRole("link", { name: "Privacy policy", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Privacy policy", exact: true }),
    ).toBeVisible();
    await page.waitForFunction(
      () => Reflect.get(window, "pageTransitionScroll")?.done,
    );
    const trace = await page.evaluate(
      () =>
        Reflect.get(window, "pageTransitionScroll") as {
          before: number;
          frames: { outgoing: number; scroll: number }[];
        },
    );
    expect(trace.frames.length).toBeGreaterThan(0);
    for (const frame of trace.frames) {
      expect(frame.scroll).toBe(0);
      expect(Math.abs(frame.outgoing - trace.before)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "How Chatter is built",
    );
    await expect(
      page.locator('main div.contents[aria-hidden="true"]'),
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.evaluate(() =>
      window.scrollTo({ top: 500, behavior: "instant" }),
    );
    await page.goForward();
    await expect(
      page.getByRole("heading", { name: "Privacy policy", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('main div.contents[aria-hidden="true"]'),
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}
