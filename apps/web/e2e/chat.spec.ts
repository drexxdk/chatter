import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  connectRawGuest,
  waitForConnectionState,
  waitForRooms,
  waitForReservedNickname,
} from "./chatServer";
import { E2E } from "./constants";
import { PayloadApi } from "./payload";
import { Redis } from "ioredis";

const RUN = crypto.randomUUID().slice(0, 8);
const LOUNGE = {
  name: `E2E Lounge ${RUN}`,
  slug: `${E2E.slugPrefix}lounge-${RUN}`,
  maxMembers: 5,
};
const TINY = {
  name: `E2E Tiny ${RUN}`,
  slug: `${E2E.slugPrefix}tiny-${RUN}`,
  maxMembers: 1,
};
const SLOW = {
  name: `E2E Slow ${RUN}`,
  slug: `${E2E.slugPrefix}slow-${RUN}`,
  maxMembers: 5,
  slowModeSeconds: 3,
};

const payload = new PayloadApi();
const roomIds: number[] = [];

test.beforeAll(async () => {
  await payload.login();

  const rooms: {
    name: string;
    slug: string;
    maxMembers: number;
    slowModeSeconds?: number;
  }[] = [LOUNGE, TINY, SLOW];

  for (const room of rooms) {
    roomIds.push(
      await payload.createRoom(
        room.name,
        room.slug,
        room.maxMembers,
        room.slowModeSeconds ?? null,
      ),
    );
  }

  // The chat-server picks new rooms up on its next cache sync.
  await waitForRooms([LOUNGE.slug, TINY.slug, SLOW.slug]);
});

test.afterAll(async () => {
  await Promise.all(roomIds.map((id) => payload.remove("public-rooms", id)));
});

// Guests stay connected until their browser context closes, so each test must close its own or they
// would still be members of the shared rooms during the next test.
const guestContexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(guestContexts.splice(0).map((context) => context.close()));
});

async function newGuest(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    locale: "en-US",
    extraHTTPHeaders: {
      "X-Forwarded-For": `10.${crypto.getRandomValues(new Uint8Array(3)).join(".")}`,
    },
  });
  guestContexts.push(context);
  return context.newPage();
}

async function isolatedRoom(name: string) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const room = {
    name: `${name} ${suffix}`,
    slug: `${E2E.slugPrefix}${suffix}`,
  };
  roomIds.push(await payload.createRoom(room.name, room.slug, 5));
  await waitForRooms([room.slug]);
  return room;
}

async function startJoin(page: Page, roomName: string, nickname: string) {
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${roomName}` }).click();
  await page.getByRole("textbox", { name: "Nickname" }).fill(nickname);
  await acceptTerms(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

// A new browser is asked to say it is 18 or older and accepts the terms.
async function acceptTerms(page: Page) {
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
}

async function enterRoom(page: Page, roomName: string, nickname: string) {
  await startJoin(page, roomName, nickname);
  await expect(
    page.getByRole("heading", { name: roomName, level: 2 }),
  ).toBeVisible();
}

async function fillMessage(box: Locator, text: string) {
  await box.fill("");
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (index > 0) await box.press("Shift+Enter");
    if (line) await box.page().keyboard.insertText(line);
  }
  await expect
    .poll(() =>
      box.evaluate((element) => {
        const content = element.cloneNode(true) as HTMLElement;
        content
          .querySelectorAll("br.ProseMirror-trailingBreak")
          .forEach((line) => line.remove());
        content
          .querySelectorAll("br")
          .forEach((line) => line.replaceWith("\n"));
        return content.textContent;
      }),
    )
    .toBe(text);
}

async function send(page: Page, text: string, recipient?: string) {
  await fillMessage(
    page.getByRole("textbox", {
      name: recipient ? `Message to ${recipient}` : "Message",
      exact: true,
    }),
    text,
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

async function leaveRoom(page: Page) {
  await page.locator("#room-heading").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Leave room", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Public rooms" }),
  ).toBeVisible();
}

async function expectPickerAligned(page: Page) {
  await page.evaluate(() =>
    Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  const toggle = page.getByRole("button", {
    name: "Add attachments",
    exact: true,
  });
  await toggle.click();
  const picker = page.getByRole("dialog", {
    name: "Add attachments",
    exact: true,
  });
  await expect(picker).toBeVisible();
  const composer = page.locator("form[data-composer]:visible");
  await expect(composer).toHaveCount(1);
  await expect
    .poll(() =>
      picker.evaluate((element) => {
        const panel = element.getBoundingClientRect();
        const box = document
          .querySelector("form[data-composer]")!
          .getBoundingClientRect();
        return Math.abs(panel.x - box.x);
      }),
    )
    .toBeLessThan(1);
  const bounds = await picker.boundingBox();
  const box = await composer.boundingBox();
  const header = await page.locator("header").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(header!.y + header!.height + 8 - 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(box!.y);
  await picker.press("Escape");
  await expect(picker).toHaveCount(0);
}

test("reload state keeps sign-in text private and never restores passwords", async ({
  page,
}) => {
  await page.goto("/?dialog=signin");
  const dialog = page.getByRole("dialog", { name: "Sign in", exact: true });
  const identifier = dialog.locator('input[autocomplete="username"]');
  const password = dialog.getByLabel("Password", { exact: true });
  await identifier.fill("private-identifier@example.test");
  await password.fill("never-store-this-password");
  await expect(page).toHaveURL(/\?dialog=signin$/);
  await page.reload();
  await expect(dialog).toBeVisible();
  await expect(identifier).toHaveValue("private-identifier@example.test");
  await expect(password).toHaveValue("");
  const saved = await page.evaluate(() =>
    JSON.stringify(Object.entries(sessionStorage)),
  );
  expect(saved).not.toContain("never-store-this-password");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(
    `/rooms/missing-${crypto.randomUUID()}?dialog=profile&menu=rooms`,
  );
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("reload state restores menus and private drafts without history replay", async ({
  browser,
}) => {
  const room = await isolatedRoom("Reload state");
  const page = await newGuest(browser);
  const nickname = `Url${crypto.randomUUID().slice(0, 6)}`;
  await enterRoom(page, room.name, nickname);
  const box = page.getByRole("textbox", { name: "Message", exact: true });
  await fillMessage(box, "private draft\nsecond line");
  await page.getByRole("button", { name: `Account menu: ${nickname}` }).click();
  await expect(page).toHaveURL(/\?menu=main$/);
  await page.reload();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page).toHaveURL(/\?menu=main$/);
  await expect(box).toContainText("private draft");
  expect(page.url()).not.toContain("private");
  await page
    .getByRole("menuitem", { name: "Your profile", exact: true })
    .click();
  const profile = page.getByRole("dialog", {
    name: "Your profile",
    exact: true,
  });
  await profile
    .getByRole("button", { name: "Edit profile", exact: true })
    .click();
  await profile.locator("#profile-nickname").fill("Unsaved profile name");
  await profile.getByLabel("Day", { exact: true }).fill("1");
  await profile.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByRole("option", { name: "January", exact: true }).click();
  const birthYear = String(new Date().getUTCFullYear() - 30);
  await profile.getByLabel("Year", { exact: true }).fill(birthYear);
  await expect(page).toHaveURL(/\?dialog=profile-edit$/);
  await page.reload();
  await expect(profile.locator("#profile-nickname")).toHaveValue(
    "Unsaved profile name",
  );
  await expect(profile.getByLabel("Day", { exact: true })).toHaveValue("01");
  await expect(
    profile.getByRole("button", { name: "Month", exact: true }),
  ).toHaveText("January");
  await expect(profile.getByLabel("Year", { exact: true })).toHaveValue(
    birthYear,
  );
  await profile.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(profile.getByText(nickname, { exact: true })).toBeVisible();
  await profile.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("#room-heading").getByRole("button").click();
  await expect(page).toHaveURL(/\?menu=rooms$/);
  await page.reload();
  await expect(
    page.getByRole("menuitem", { name: "Leave room", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/rooms/${room.slug}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/rooms/${room.slug}$`));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(box).toContainText("private draft");
  await expect(box).toContainText("second line");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(box).toHaveText("");
  await page.reload();
  await expect(box).toHaveText("");
});

for (const width of [390, 1280]) {
  test(`reload state restores the guest prompt and picker at ${width}px`, async ({
    browser,
  }) => {
    const room = await isolatedRoom("Reload picker");
    const page = await newGuest(browser);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: `Join ${room.name}` }).click();
    const nickname = `Draft${crypto.randomUUID().slice(0, 6)}`;
    await page
      .getByRole("textbox", { name: "Nickname", exact: true })
      .fill(nickname);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("dialog"))
      .toBe("join");
    expect(page.url()).not.toContain(nickname);
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Nickname", exact: true }),
    ).toHaveValue(nickname);
    await expect(
      page.getByRole("checkbox", { name: /18 or older/ }),
    ).not.toBeChecked();
    await acceptTerms(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("log", { name: room.name })).toBeVisible();
    await page
      .getByRole("button", { name: "Add attachments", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Add attachments",
      exact: true,
    });
    await picker.getByRole("tab", { name: "YouTube", exact: true }).click();
    const link = "https://youtu.be/dQw4w9WgXcQ";
    await picker.locator('input[type="url"]').fill(link);
    await expect(page).toHaveURL(/\?menu=attachments&picker=youtube$/);
    expect(page.url()).not.toContain("dQw4w9WgXcQ");
    await page.reload();
    await expect(picker).toBeVisible();
    await expect(
      picker.getByRole("tab", { name: "YouTube", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(picker.locator('input[type="url"]')).toHaveValue(link);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`/rooms/${room.slug}$`));
    if (width < 768) {
      await page
        .getByRole("button", {
          name: "People and direct messages",
          exact: true,
        })
        .click();
      const people = page.getByRole("region", {
        name: "People and direct messages",
        exact: true,
      });
      await people.locator("input").fill("private people search");
      await expect(page).toHaveURL(/\?menu=people$/);
      await page.reload();
      await expect(people).toBeVisible();
      await expect(people.locator("input")).toHaveValue(
        "private people search",
      );
    }
  });
}

test("joining as a guest opens long room history at the bottom", async ({
  browser,
}) => {
  const seeder = await connectRawGuest("History Seeder", "198.51.100.42");
  try {
    expect((await seeder.join(LOUNGE.slug)).ok).toBe(true);
    const history = [
      "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      ...Array.from({ length: 28 }, (_, index) => `History line ${index + 1}`),
    ].join("\n");
    expect((await seeder.send(history)).ok).toBe(true);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 700 },
    ]) {
      const guest = await newGuest(browser);
      await guest.setViewportSize(viewport);
      await guest.goto("/");
      await guest.addStyleTag({
        content: "main:has(#lobby-heading) { min-height: 1800px; }",
      });
      await guest.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
      await guest
        .getByRole("textbox", { name: "Nickname" })
        .fill(`Bottom Guest ${viewport.width}`);
      await acceptTerms(guest);
      await guest
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(
        guest.getByRole("heading", { name: LOUNGE.name, level: 2 }),
      ).toBeVisible();
      await expect(guest.getByRole("dialog")).toHaveCount(0);
      await expect(guest.getByRole("log")).toBeVisible({ timeout: 15_000 });
      await expect(
        guest.getByRole("log").getByText("History line 28", { exact: false }),
      ).toBeVisible();
      await guest.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      expect(
        await guest.evaluate(
          () =>
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
        ),
      ).toBeGreaterThan(100);
      await expect
        .poll(() =>
          guest.evaluate(() => {
            const page = document.documentElement;
            return page.scrollHeight - page.scrollTop - page.clientHeight;
          }),
        )
        .toBeLessThan(2);
      await guest.context().close();
    }
  } finally {
    seeder.close();
  }
});

test("virtual room history follows new messages only while reading the bottom", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const room = await isolatedRoom("Virtual history");
  const redis = new Redis(E2E.redisUrl);
  const sender = await connectRawGuest("Virtual Sender", "198.51.100.43");
  const secondSender = await connectRawGuest(
    "Virtual Second Sender",
    "198.51.100.44",
  );
  try {
    const history = Array.from({ length: 200 }, (_, index) =>
      JSON.stringify({
        id: `virtual-history-${index}`,
        roomSlug: room.slug,
        guestId: `virtual-author-${index % 2}`,
        nickname: `History Person ${index % 2}`,
        text: `Virtual history message ${index}`,
        avatar: "other",
        ipHash: "fixture",
        sentAt: new Date(Date.now() - (200 - index) * 1000).toISOString(),
      }),
    );
    await redis.rpush(`chatter:history:${room.slug}`, ...history);
    expect((await sender.join(room.slug)).ok).toBe(true);
    expect((await secondSender.join(room.slug)).ok).toBe(true);
    for (const width of [1280, 390]) {
      const guest = await newGuest(browser);
      await guest.setViewportSize({ width, height: 720 });
      await enterRoom(guest, room.name, `Virtual Reader ${width}`);
      const log = guest.getByRole("log");
      await expect(log).toBeVisible({ timeout: 15_000 });
      await expect(
        log.getByText("Virtual history message 199", { exact: true }),
      ).toBeInViewport();
      const distance = () =>
        guest.evaluate(
          () =>
            document.documentElement.scrollHeight -
            window.scrollY -
            window.innerHeight,
        );
      await expect.poll(distance).toBeLessThan(3);
      expect((await sender.send(`Live bottom ${width}`)).ok).toBe(true);
      await expect(
        log.getByText(`Live bottom ${width}`, { exact: true }),
      ).toBeInViewport();
      await expect.poll(distance).toBeLessThan(3);
      const search = guest.getByRole("combobox", { name: "Search messages" });
      await search.fill("Virtual history message 150");
      await expect(guest.getByRole("option")).toHaveCount(1);
      await search.press("Enter");
      const anchor = guest.locator('[data-nav-id="virtual-history-150"]');
      await expect(anchor).toBeFocused();
      await expect(anchor).toBeInViewport();
      const top = await anchor.evaluate(
        (element) => element.getBoundingClientRect().top,
      );
      expect((await secondSender.send(`Do not follow ${width}`)).ok).toBe(true);
      await expect(
        log.locator("..").getByText(`Do not follow ${width}`, { exact: false }),
      ).toHaveCount(1);
      await expect
        .poll(async () =>
          Math.abs(
            (await anchor.evaluate(
              (element) => element.getBoundingClientRect().top,
            )) - top,
          ),
        )
        .toBeLessThan(3);
      await expect(anchor).toBeFocused();
      await guest.context().close();
    }
  } finally {
    sender.close();
    secondSender.close();
    redis.disconnect();
  }
});

test("empty and short virtual logs stay bottom aligned", async ({
  browser,
}) => {
  for (const width of [1280, 390]) {
    const guest = await newGuest(browser);
    await guest.setViewportSize({ width, height: 720 });
    await guest.goto("/");
    await expect(
      guest.getByRole("heading", { name: "Chatter", exact: true }),
    ).toBeVisible();
    const results = await guest.evaluate(async () => {
      const paths = [
        "/node_modules/.vite/deps/react.js",
        "/node_modules/.vite/deps/react-dom_client.js",
        "/node_modules/.vite/deps/react-dom.js",
        "/src/components/MessageLog.tsx",
        "/src/components/MessageRow.tsx",
        "/src/chat/avatar.ts",
      ];
      const [
        { default: React },
        {
          default: { createRoot },
        },
        {
          default: { flushSync },
        },
        { MessageLog },
        { MessageGroup },
        { PLAIN_AVATAR },
      ] = await Promise.all(paths.map((path) => import(path)));
      document.getElementById("root")!.style.display = "none";
      const container = document.createElement("main");
      container.style.cssText =
        "max-width:900px;margin:0 auto;padding:16px;min-height:600px;display:flex;flex-direction:column";
      document.body.append(container);
      const root = createRoot(container);
      const measured = [];
      for (const count of [0, 1, 5]) {
        flushSync(() =>
          root.render(
            React.createElement(
              MessageLog,
              { label: "Short log" },
              count
                ? Array.from({ length: count }, (_, index) =>
                    React.createElement(MessageGroup, {
                      key: `short-${index}`,
                      mine: false,
                      nickname: `Person ${index}`,
                      role: "guest",
                      avatar: PLAIN_AVATAR,
                      messages: [
                        {
                          id: `short-${index}`,
                          text: `Short message ${index}`,
                          sentAt: "2026-10-23T12:00:00Z",
                        },
                      ],
                      nav: { stopId: `short-${count - 1}` },
                    }),
                  )
                : React.createElement(
                    "li",
                    { key: "empty" },
                    "No messages yet.",
                  ),
            ),
          ),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const log = container.querySelector('[role="log"]')!;
        const last = log.lastElementChild!;
        measured.push({
          count,
          rows: log.children.length,
          bottomGap:
            log.getBoundingClientRect().bottom -
            last.getBoundingClientRect().bottom,
          fillsParent:
            container.getBoundingClientRect().bottom -
            log.getBoundingClientRect().bottom,
          position: getComputedStyle(last).position,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        });
      }
      return measured;
    });
    for (const result of results) {
      expect(result.rows).toBe(Math.max(1, result.count));
      expect(Math.abs(result.bottomGap - 12)).toBeLessThan(1);
      expect(Math.abs(result.fillsParent - 16)).toBeLessThan(1);
      expect(result.position).toBe("absolute");
      expect(result.overflow).toBe(false);
    }
    await guest.context().close();
  }
});

test("bounded message log keeps every keyboard destination reachable", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const profiling = process.env.MESSAGE_LOG_PROFILE === "true";
  const cpuThrottle = profiling ? 4 : 1;
  const samples = [];
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 700 },
  ]) {
    const guest = await newGuest(browser);
    await guest.setViewportSize(viewport);
    await guest.goto("/");
    await expect(
      guest.getByRole("heading", { name: "Chatter", exact: true }),
    ).toBeVisible();
    const cdp = await guest.context().newCDPSession(guest);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
    const metrics = await guest.evaluate(
      async (sampleCount) => {
        const reactPath = "/node_modules/.vite/deps/react.js";
        const clientPath = "/node_modules/.vite/deps/react-dom_client.js";
        const domPath = "/node_modules/.vite/deps/react-dom.js";
        const logPath = "/src/components/MessageLog.tsx";
        const rowPath = "/src/components/MessageRow.tsx";
        const avatarPath = "/src/chat/avatar.ts";
        const navigationPath = "/src/rowNavigation.ts";
        const [
          { default: React },
          {
            default: { createRoot },
          },
          {
            default: { flushSync },
          },
          { MessageLog },
          { MessageGroup },
          { PLAIN_AVATAR },
          { useRowNavigation },
        ] = await Promise.all([
          import(reactPath),
          import(clientPath),
          import(domPath),
          import(logPath),
          import(rowPath),
          import(avatarPath),
          import(navigationPath),
        ]);
        document.getElementById("root")!.style.display = "none";
        document.documentElement.style.scrollBehavior = "auto";
        const ids = Array.from({ length: 200 }, (_, index) => `trial-${index}`);
        const entries = ids.map((id, index) => ({
          id,
          text:
            index % 10 === 0
              ? Array.from(
                  { length: 8 },
                  () => "A longer message with several lines to measure.",
                ).join("\n")
              : `Message ${index + 1}: a representative chat message.`,
          sentAt: "2026-10-23T12:00:00Z",
        }));
        let nextMessage = 200;
        function Harness() {
          const rows = useRowNavigation(ids);
          return React.createElement(
            MessageLog,
            {
              label: "Trial log",
              onFocus: rows.onFocus,
              onBlur: rows.onBlur,
              onKeyDownCapture: rows.onKeyDownCapture,
            },
            entries.map((message, index) =>
              React.createElement(MessageGroup, {
                key: message.id,
                mine: false,
                nickname: `Person ${index + 1}`,
                role: "guest",
                avatar: PLAIN_AVATAR,
                messages: [message],
                nav: { stopId: rows.stopId },
              }),
            ),
          );
        }
        const results = [];
        for (let sample = 0; sample < sampleCount; sample += 1) {
          window.scrollTo(0, 0);
          const container = document.createElement("main");
          container.style.cssText =
            "max-width:900px;margin:0 auto;padding:16px";
          document.body.append(container);
          const root = createRoot(container);
          const started = performance.now();
          flushSync(() => root.render(React.createElement(Harness)));
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          const log = container.querySelector('[role="log"]')!;
          results.push({
            mountToTwoFramesMs: Math.round(performance.now() - started),
            nodes: log.querySelectorAll("*").length,
            messages: log.querySelectorAll("[data-nav-id]").length,
          });
          if (sample < sampleCount - 1) {
            flushSync(() => root.unmount());
            container.remove();
          } else {
            Object.assign(window, {
              updateVirtualLog: (trim: boolean) => {
                if (trim) {
                  entries.splice(0, 10);
                  ids.splice(0, 10);
                }
                for (let index = 0; index < 10; index += 1) {
                  const id = `append-${nextMessage++}`;
                  ids.push(id);
                  entries.push({
                    id,
                    text: `New message ${id}`,
                    sentAt: "2026-10-23T12:01:00Z",
                  });
                }
                flushSync(() => root.render(React.createElement(Harness)));
              },
              showVirtualSearch: async () => {
                const searchPath = "/src/components/RoomSearch.tsx";
                const { RoomSearch } = await import(searchPath);
                const header = document.createElement("header");
                header.style.cssText =
                  "position:fixed;top:0;left:0;right:0;height:56px;z-index:50;background:#171717";
                document.body.append(header);
                flushSync(() =>
                  createRoot(header).render(
                    React.createElement(RoomSearch, {
                      roomSlug: "trial",
                      roomName: "Trial log",
                      threads: [],
                      ownGuestIds: [],
                      messages: entries.map((message, index) => ({
                        ...message,
                        roomSlug: "trial",
                        guestId: `person-${index}`,
                        nickname: `Person ${index + 1}`,
                      })),
                    }),
                  ),
                );
              },
            });
          }
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
        return results;
      },
      profiling ? 3 : 1,
    );
    samples.push({ viewport, cpuThrottle, metrics });
    if (profiling) {
      await testInfo.attach(`bounded-log-${viewport.width}.png`, {
        body: await guest.screenshot(),
        contentType: "image/png",
      });
      console.info("MESSAGE_LOG_TRIAL", JSON.stringify(samples.at(-1)));
    }
    const newest = guest.locator('[data-nav-id="trial-199"]');
    await newest.focus();
    await newest.press("Home");
    await expect.soft(guest.locator('[data-nav-id="trial-0"]')).toBeFocused();
    await guest.keyboard.press("End");
    await expect.soft(guest.locator('[data-nav-id="trial-199"]')).toBeFocused();
    await expect
      .poll(() => guest.locator('[role="log"] [data-nav-id]').count())
      .toBeLessThan(60);
    await guest.evaluate(async () => {
      await (
        window as unknown as { showVirtualSearch: () => Promise<void> }
      ).showVirtualSearch();
    });
    const search = guest.getByRole("combobox", { name: "Search messages" });
    await search.fill("Message 82:");
    await expect(guest.getByRole("option")).toHaveCount(1);
    await search.press("Enter");
    const result = guest.locator('[data-nav-id="trial-81"]');
    await expect(result).toBeFocused();
    await expect(result).toHaveAttribute("data-search-match");
    await expect(result).toBeInViewport();
    const beforeAppend = await result.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    await guest.evaluate(() =>
      (
        window as unknown as { updateVirtualLog: (trim: boolean) => void }
      ).updateVirtualLog(false),
    );
    await expect(guest.locator('[aria-live="polite"].sr-only')).toContainText(
      "New message append-200",
    );
    await expect(
      guest.locator('[aria-live="polite"].sr-only'),
    ).not.toContainText("Message 82:");
    await expect(result).toBeFocused();
    await expect
      .poll(async () =>
        Math.abs(
          (await result.evaluate(
            (element) => element.getBoundingClientRect().top,
          )) - beforeAppend,
        ),
      )
      .toBeLessThan(3);
    await guest.evaluate(() =>
      (
        window as unknown as { updateVirtualLog: (trim: boolean) => void }
      ).updateVirtualLog(true),
    );
    await expect(result).toBeFocused();
    await expect
      .poll(async () =>
        Math.abs(
          (await result.evaluate(
            (element) => element.getBoundingClientRect().top,
          )) - beforeAppend,
        ),
      )
      .toBeLessThan(3);
    await result.evaluate((element) => {
      const row = element.closest("li")!;
      const previous = row.previousElementSibling as HTMLElement;
      previous.style.minHeight = `${previous.getBoundingClientRect().height + 150}px`;
    });
    await expect
      .poll(async () =>
        Math.abs(
          (await result.evaluate(
            (element) => element.getBoundingClientRect().top,
          )) - beforeAppend,
        ),
      )
      .toBeLessThan(3);
    await guest.evaluate(() => window.scrollTo(0, 0));
    await expect(result).toBeFocused();
    await expect
      .poll(() => guest.locator('[role="log"] [data-nav-id]').count())
      .toBeLessThan(60);
    await result.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    const text = result.locator("p").first();
    const bounds = await text.boundingBox();
    expect(bounds).not.toBeNull();
    await guest.mouse.move(bounds!.x + 10, bounds!.y + 10);
    await guest.mouse.down();
    await guest.mouse.move(
      bounds!.x + Math.min(bounds!.width - 5, 150),
      bounds!.y + 10,
      { steps: 8 },
    );
    await guest.mouse.up();
    await expect
      .poll(() =>
        guest.evaluate(() => document.getSelection()?.toString().length ?? 0),
      )
      .toBeGreaterThan(0);
    await guest.evaluate(() => document.getSelection()?.removeAllRanges());
    await expect
      .poll(() => guest.locator('[role="log"] [data-nav-id]').count())
      .toBeLessThan(60);
    await result.focus();
    await result.press("Control+a");
    await expect
      .poll(() =>
        guest.evaluate(() => document.getSelection()?.toString() ?? ""),
      )
      .toContain("New message append-219");
    await guest.evaluate(() => document.getSelection()?.removeAllRanges());
    await expect
      .poll(() => guest.locator('[role="log"] [data-nav-id]').count())
      .toBeLessThan(60);
    await guest.context().close();
  }
  await testInfo.attach("bounded-log-metrics.json", {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
});

test("private-message sounds are opt-in with adjustable volume", async ({
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  const sender = await newGuest(browser);
  const recipient = await newGuest(browser);
  await recipient.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    const probe = { notes: 0, levels: [] as number[] };
    Object.assign(window, { notificationAudio: probe });
    window.AudioContext = class extends NativeAudioContext {
      createOscillator() {
        probe.notes += 1;
        return super.createOscillator();
      }
      createGain() {
        const gain = super.createGain();
        const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
        gain.gain.linearRampToValueAtTime = (value, time) => {
          if (value > 0) probe.levels.push(value);
          return ramp(value, time);
        };
        return gain;
      }
    };
  });
  const audio = () =>
    recipient.evaluate(
      () =>
        (
          window as unknown as {
            notificationAudio: { notes: number; levels: number[] };
          }
        ).notificationAudio,
    );
  await enterRoom(sender, LOUNGE.name, "Sound Sender");
  await enterRoom(recipient, LOUNGE.name, "Sound Recipient");
  await sender
    .getByRole("button", { name: "Open private chat with Sound Recipient" })
    .click();
  await recipient
    .getByRole("button", { name: "Open private chat with Sound Sender" })
    .click();
  await send(sender, "Silent by default", "Sound Recipient");
  await expect(
    recipient.getByRole("log").getByText("Silent by default", { exact: true }),
  ).toBeVisible();
  expect((await audio()).notes).toBe(0);

  const openSettings = async () => {
    await recipient
      .getByRole("button", { name: "Account menu: Sound Recipient" })
      .click();
    await recipient.getByRole("menuitem", { name: "Settings" }).click();
    return recipient.getByRole("dialog", {
      name: "Settings",
      exact: true,
    });
  };
  const dialog = await openSettings();
  const enabled = dialog.getByRole("checkbox", {
    name: "Private message sounds",
  });
  const volume = dialog.getByRole("slider", { name: "Volume" });
  await expect(enabled).not.toBeChecked();
  await expect(volume).toBeEnabled();
  await volume.focus();
  await volume.press("Home");
  for (let step = 0; step < 25; step += 1) await volume.press("ArrowRight");
  await expect(volume).toHaveValue("25");
  await dialog.getByRole("button", { name: "Preview sound" }).click();
  await expect.poll(async () => (await audio()).notes).toBe(2);
  expect((await audio()).levels).toEqual([0.04, 0.04]);
  await expect(enabled).not.toBeChecked();
  await enabled.check();

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await recipient.setViewportSize(viewport);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await recipient.screenshot({
      path: testInfo.outputPath(`notification-sound-${viewport.width}.png`),
      animations: "disabled",
    });
  }
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  await send(sender, "A new private message", "Sound Recipient");
  await expect(
    recipient
      .getByRole("log")
      .getByText("A new private message", { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await audio()).notes).toBe(4);

  await openSettings();
  await expect(enabled).toBeChecked();
  await expect(volume).toHaveValue("25");
  await volume.focus();
  await volume.press("Home");
  await expect(volume).toHaveValue("0");
  await expect(
    dialog.getByRole("button", { name: "Preview sound" }),
  ).toBeEnabled();
  await dialog.press("Escape");
  await send(sender, "Muted private message", "Sound Recipient");
  await expect(
    recipient
      .getByRole("log")
      .getByText("Muted private message", { exact: true }),
  ).toBeVisible();
  expect((await audio()).notes).toBe(4);

  await openSettings();
  await enabled.uncheck();
  const warnings = dialog.getByRole("checkbox", { name: "Warnings" });
  const joins = dialog.getByRole("checkbox", { name: "People joining" });
  await warnings.check();
  await joins.check();
  await dialog.getByRole("button", { name: "Sound for Warnings" }).click();
  await recipient.getByRole("option", { name: "Bell", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Sound for People joining" })
    .click();
  await recipient.getByRole("option", { name: "Wood", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview Warnings" }).click();
  expect((await audio()).notes).toBe(4);
  await volume.focus();
  for (let step = 0; step < 25; step += 1) await volume.press("ArrowRight");
  await dialog.getByRole("button", { name: "Preview Warnings" }).click();
  await expect.poll(async () => (await audio()).notes).toBe(6);
  await dialog.press("Escape");
  const joiner = await newGuest(browser);
  await enterRoom(joiner, LOUNGE.name, "Sound Joiner");
  await expect.poll(async () => (await audio()).notes).toBe(7);
  await send(sender, "Private sounds stay off", "Sound Recipient");
  await expect(
    recipient
      .getByRole("log")
      .getByText("Private sounds stay off", { exact: true }),
  ).toBeVisible();
  expect((await audio()).notes).toBe(7);
  await recipient.reload();
  await expect(recipient.getByRole("log")).toBeVisible();
  await openSettings();
  await expect(enabled).not.toBeChecked();
  await expect(warnings).toBeChecked();
  await expect(joins).toBeChecked();
  await expect(volume).toHaveValue("25");
  await expect(
    dialog.getByRole("button", { name: "Sound for Warnings" }),
  ).toHaveText("Bell");
  await expect(
    dialog.getByRole("button", { name: "Sound for People joining" }),
  ).toHaveText("Wood");
});

test("sidebar accordions share edge-aligned scrollbars and content gutters", async ({
  browser,
}, testInfo) => {
  const guest = await newGuest(browser);
  const writer = await newGuest(browser);
  await guest.setViewportSize({ width: 1280, height: 800 });
  await enterRoom(guest, LOUNGE.name, "Panel Guest");
  await enterRoom(writer, LOUNGE.name, "Panel Writer");
  await writer
    .getByRole("button", { name: "Open private chat with Panel Guest" })
    .click();
  await send(writer, "A conversation for the sidebar", "Panel Guest");
  const aside = guest.locator("aside.panel");
  await expect(
    aside.getByRole("list", { name: "Direct messages" }),
  ).toContainText("Panel Writer");
  await guest.addStyleTag({
    content: ".panel .panel-list { max-height: 2rem; }",
  });
  const lists = aside.locator(".panel-list");
  await expect(lists).toHaveCount(2);

  for (const width of [1280, 900]) {
    await guest.setViewportSize({ width, height: 800 });
    const bounds = await aside.boundingBox();
    for (const list of await lists.all()) {
      const layout = await list.evaluate((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          right: bounds.right,
          padding: style.paddingInlineEnd,
          scrolls: element.scrollHeight > element.clientHeight,
          contentRight: element.querySelector("ul")!.getBoundingClientRect()
            .right,
          gutterStart: bounds.left + element.clientWidth,
        };
      });
      expect(layout.right).toBeCloseTo(bounds!.x + bounds!.width - 1, 0);
      expect(layout.padding).toBe("12px");
      expect(layout.scrolls).toBe(true);
      expect(layout.gutterStart - layout.contentRight).toBeCloseTo(12, 0);
    }
    await aside.screenshot({
      path: testInfo.outputPath(`sidebar-scrollbars-${width}.png`),
      animations: "disabled",
    });
    const toggle = aside.getByRole("button", { name: /^In this room/ });
    const positions = await toggle.evaluate(
      (button) =>
        new Promise<number[]>((resolve) => {
          const nextSection = button.closest("section")!.nextElementSibling!;
          const positions: number[] = [];
          button.click();
          function capture() {
            positions.push(nextSection.getBoundingClientRect().top);
            if (positions.length < 20) requestAnimationFrame(capture);
            else resolve(positions);
          }
          requestAnimationFrame(capture);
        }),
    );
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
});

test("the recipient chip sits above the textarea beside typing activity", async ({
  browser,
}, testInfo) => {
  const guest = await newGuest(browser);
  const writer = await newGuest(browser);
  await guest.setViewportSize({ width: 1280, height: 800 });
  await enterRoom(guest, LOUNGE.name, "Chip Guest");
  await enterRoom(writer, LOUNGE.name, "Long Recipient");
  await guest
    .getByRole("list", { name: "People in this room" })
    .getByRole("button", { name: /^Long Recipient/ })
    .click();

  const surface = guest.locator(".composer-surface:visible");
  const chip = surface.getByRole("button", {
    name: "Open private chat",
    exact: true,
  });
  const input = guest.getByRole("textbox", {
    name: "Message to Long Recipient",
    exact: true,
  });
  const activity = surface.locator("[data-typing-indicator]");
  for (const width of [1280, 375, 320]) {
    await guest.setViewportSize({ width, height: 800 });
    await fillMessage(
      writer.getByRole("textbox", { name: "Message", exact: true }),
      `Room draft ${width}`,
    );
    await expect(activity).toHaveText("Long Recipient is typing");
    await expect(chip).toBeVisible();
    await expect(
      surface
        .locator("form")
        .getByRole("button", { name: "Open private chat", exact: true }),
    ).toHaveCount(0);
    const chipBounds = await chip.boundingBox();
    const inputBounds = await input.boundingBox();
    const activityBounds = await activity.boundingBox();
    expect(chipBounds!.y + chipBounds!.height).toBeLessThanOrEqual(
      inputBounds!.y,
    );
    expect(chipBounds!.x).toBeGreaterThanOrEqual(0);
    expect(chipBounds!.x + chipBounds!.width).toBeLessThanOrEqual(width);
    expect(activityBounds!.x + activityBounds!.width).toBeLessThanOrEqual(
      width,
    );
    if (width === 1280)
      expect(chipBounds!.x + chipBounds!.width).toBeLessThan(activityBounds!.x);
    await surface.screenshot({
      path: testInfo.outputPath(`recipient-chip-${width}.png`),
      animations: "disabled",
    });
  }

  await surface.getByRole("button", { name: "Stop writing privately" }).click();
  await expect(
    guest.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeVisible();
  await expect(surface.getByText("Room", { exact: true })).toBeVisible();
});

test("typing indicators keep private drafts private and follow the current conversation", async ({
  browser,
}, testInfo) => {
  const room = await isolatedRoom("E2E Typing");
  const otherRoom = await isolatedRoom("E2E Other Typing");
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  const carol = await newGuest(browser);
  const dana = await newGuest(browser);
  await enterRoom(alice, room.name, "Typing Alice");
  await enterRoom(bob, room.name, "Typing Bob");
  await enterRoom(carol, room.name, "Typing Carol");
  await enterRoom(dana, otherRoom.name, "Typing Dana");
  const activity = (page: Page) =>
    page.locator("[data-typing-indicator]:visible");
  const aliceBox = alice.getByRole("textbox", { name: "Message", exact: true });
  await fillMessage(aliceBox, "Public draft");
  await expect(activity(bob)).toHaveText("Typing Alice is typing");
  await expect(activity(carol)).toHaveText("Typing Alice is typing");
  await expect(activity(dana)).toBeEmpty();
  await alice.getByRole("button", { name: "Send", exact: true }).click();
  await expect(activity(bob)).toBeEmpty();

  await alice
    .getByRole("button", { name: "Open private chat with Typing Bob" })
    .click();
  const alicePrivate = alice.getByRole("textbox", {
    name: "Message to Typing Bob",
    exact: true,
  });
  await fillMessage(alicePrivate, "Private draft");
  await expect(activity(bob)).toHaveText("Typing Alice is typing");
  await expect(activity(carol)).toBeEmpty();
  await expect(activity(dana)).toBeEmpty();

  await fillMessage(
    carol.getByRole("textbox", { name: "Message", exact: true }),
    "Another public draft",
  );
  await expect(activity(bob)).toHaveText(
    "Typing Alice and Typing Carol are typing",
  );
  for (const width of [1280, 390]) {
    await bob.setViewportSize({ width, height: 800 });
    await fillMessage(alicePrivate, "Still writing privately");
    await fillMessage(
      carol.getByRole("textbox", { name: "Message", exact: true }),
      "Still writing publicly",
    );
    await expect(activity(bob)).toHaveText(
      "Typing Alice and Typing Carol are typing",
    );
    const indicator = await activity(bob).boundingBox();
    const recipient = await bob
      .getByRole("textbox", { name: "Message", exact: true })
      .boundingBox();
    expect(indicator!.y + indicator!.height).toBeLessThanOrEqual(recipient!.y);
    expect(
      await bob.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await bob.screenshot({
      path: testInfo.outputPath(`typing-room-${width}.png`),
      animations: "disabled",
    });
  }
  await bob.setViewportSize({ width: 1280, height: 800 });
  await expect(activity(alice)).toBeEmpty();
  await bob
    .getByRole("button", { name: "Open private chat with Typing Alice" })
    .click();
  await expect(activity(bob)).toHaveText("Typing Alice is typing");
  const bobPrivate = bob.getByRole("textbox", {
    name: "Message to Typing Alice",
    exact: true,
  });
  await fillMessage(bobPrivate, "A private reply");
  await expect(activity(alice)).toHaveText("Typing Bob is typing");
  await expect(activity(carol)).toBeEmpty();

  for (const width of [1280, 390]) {
    await alice.setViewportSize({ width, height: 800 });
    await expect(activity(alice)).toBeInViewport();
    expect(
      await alice.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await alice.screenshot({
      path: testInfo.outputPath(`typing-${width}.png`),
      animations: "disabled",
    });
  }
  await bobPrivate.fill("");
  await expect(activity(alice)).toBeEmpty();
});

test("the people dropdown avoids touch-device autofocus and keeps a padded scroll frame when resized", async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: "en-US",
    hasTouch: true,
  });
  guestContexts.push(context);
  const guest = await context.newPage();
  await enterRoom(guest, LOUNGE.name, "Resize Guest");
  await expect(guest.getByRole("dialog")).toHaveCount(0);
  await guest.addStyleTag({ content: "::-webkit-scrollbar { width: 12px; }" });
  await guest.setViewportSize({ width: 390, height: 800 });
  const root = guest.locator("html");
  await expect(root).toHaveCSS("--scrollbar-width", "12px");

  const toggle = guest.getByRole("button", {
    name: "People and direct messages",
    exact: true,
  });
  await toggle.click();
  const panel = guest.locator("#room-panel-sheet");
  const search = panel.getByRole("searchbox", { name: "Search people" });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS("width", "224px");
  await expect(search).not.toBeFocused();
  await search.click();
  await expect(search).toBeFocused();
  await expect(root).toHaveCSS("padding-right", "0px");
  await expect(root).toHaveCSS("scrollbar-gutter", "stable");
  await expect(root).not.toHaveCSS("overflow", "hidden");

  for (const width of [400, 410, 240, 390]) {
    await guest.setViewportSize({ width, height: 800 });
    await guest.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect(root).toHaveCSS("--scrollbar-width", "12px");
    await expect(root).toHaveCSS("padding-right", "0px");
    await expect(root).toHaveCSS("scrollbar-gutter", "stable");
    await expect(panel).toBeVisible();
    const bounds = await panel.boundingBox();
    const composer = await guest.locator(".composer-focus").boundingBox();
    expect(Math.abs(bounds!.x - composer!.x)).toBeLessThan(2);
    expect(bounds!.width).toBeLessThanOrEqual(224);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (width === 240) expect(bounds!.width).toBeLessThan(224);
  }

  for (const height of [391, 800]) {
    await guest.setViewportSize({ width: 390, height });
    const scrollFrame = panel.locator(":scope > div");
    await scrollFrame.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const frame = await scrollFrame.boundingBox();
    const bounds = await panel.boundingBox();
    const bottomInset = bounds!.y + bounds!.height - frame!.y - frame!.height;
    expect(bottomInset).toBeGreaterThanOrEqual(12);
    expect(bottomInset).toBeLessThan(14);
    const empty = panel.getByText("No direct messages yet.", { exact: true });
    await expect(empty).toBeVisible();
    const emptyBounds = await empty.boundingBox();
    expect(emptyBounds!.y + emptyBounds!.height).toBeLessThanOrEqual(
      bounds!.y + bounds!.height - 12,
    );
  }

  await guest.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expectPickerAligned(guest);
  const roomToggle = guest.locator("#room-heading").getByRole("button");
  await roomToggle.click();
  const roomMenu = guest.getByRole("menu");
  await expect(roomMenu).toBeVisible();
  const menuBounds = await roomMenu.boundingBox();
  const composerBounds = await guest.locator(".composer-focus").boundingBox();
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(
    composerBounds!.y - 8 + 1,
  );
  await roomMenu.press("Escape");
  await toggle.press("Enter");
  await expect(search).not.toBeFocused();
  const message = guest.getByRole("textbox", { name: "Message", exact: true });
  await message.click();
  await expect(panel).toHaveCount(0);
  await expect(message).toBeFocused();

  await toggle.click();
  await expect(search).not.toBeFocused();
  await guest.setViewportSize({ width: 1280, height: 800 });
  await expect(panel).toHaveCount(0);
  await expect(root).toHaveCSS("scrollbar-gutter", "stable");
  await expect(root).not.toHaveCSS("overflow", "hidden");
  await expect(root).toHaveCSS("padding-right", "0px");
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 320 },
]) {
  test(`nickname entry keeps dialog focus in the viewport at ${viewport.width}x${viewport.height}`, async ({
    browser,
  }) => {
    const guest = await newGuest(browser);
    await guest.setViewportSize(viewport);
    await guest.goto("/");
    await guest.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
    const dialog = guest.getByRole("dialog", { name: "Join the chat" });
    await expect(dialog).toHaveCSS("position", "fixed");
    await expect.poll(async () => (await dialog.boundingBox())?.y).toBe(0);
    await expect
      .poll(async () => (await dialog.boundingBox())?.height)
      .toBe(viewport.height);
    const backgroundY = await guest.evaluate(() => window.scrollY);
    const nickname = dialog.getByRole("textbox", { name: "Nickname" });
    await expect(nickname).toBeFocused();
    await nickname.click();
    await nickname.pressSequentially("Scroll Guest");
    await expect(nickname).toHaveValue("Scroll Guest");
    await nickname.press("Tab");
    await nickname.press("Shift+Tab");
    await dialog.focus();
    await dialog.evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await expect
      .poll(() => guest.evaluate(() => window.scrollY))
      .toBe(backgroundY);
    if (viewport.height === 320) {
      const scroller = dialog.locator(".overflow-y-auto");
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect
        .poll(() => scroller.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      await expect(
        dialog.getByRole("button", { name: "Continue", exact: true }),
      ).toBeInViewport();
      await nickname.focus();
      await expect(nickname).toBeInViewport();
      await expect
        .poll(() => guest.evaluate(() => window.scrollY))
        .toBe(backgroundY);
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("touch composers offer GIFs and YouTube from a left-hand plus button", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  guestContexts.push(context);
  const guest = await context.newPage();
  await enterRoom(guest, LOUNGE.name, "Touch Guest");
  await expect(guest.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /interactive-widget=resizes-content/,
  );
  await guest.evaluate(() =>
    Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  const pickerButton = guest.getByRole("button", { name: "Add attachments" });
  const box = guest.getByRole("textbox", { name: "Message", exact: true });
  await expect(box).not.toBeFocused();
  const sendButton = guest.getByRole("button", { name: "Send", exact: true });
  const plusBounds = (await pickerButton.boundingBox())!;
  const editorBounds = (await box.boundingBox())!;
  const sendBounds = (await sendButton.boundingBox())!;
  expect(plusBounds.x + plusBounds.width).toBeLessThanOrEqual(
    editorBounds.x + 1,
  );
  expect(editorBounds.x + editorBounds.width).toBeLessThanOrEqual(
    sendBounds.x + 1,
  );
  await expectPickerAligned(guest);
  await pickerButton.click();
  const picker = guest.getByRole("dialog", { name: "Add attachments" });
  await expect(picker.getByRole("tab")).toHaveCount(2);
  await expect(
    picker.getByRole("tab", { name: "Emoji", exact: true }),
  ).toHaveCount(0);
  await expect(
    picker.getByRole("tab", { name: "GIFs", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await picker.getByRole("tab", { name: "YouTube", exact: true }).click();
  const link = picker.getByLabel("YouTube link", { exact: true });
  await expect(link).not.toBeFocused();
  await link.click();
  await link.fill("https://youtu.be/aqz-KE-bpKQ");
  await expect(
    picker.getByRole("img", { name: "YouTube video", exact: true }),
  ).toHaveJSProperty("naturalWidth", 480);
  for (const height of [480, 844]) {
    await guest.setViewportSize({ width: 390, height });
    await expect
      .poll(() =>
        picker.evaluate((element) => {
          const panel = element.getBoundingClientRect();
          const composer = document
            .querySelector("form[data-composer]")!
            .getBoundingClientRect();
          const header = document
            .querySelector("header")!
            .getBoundingClientRect();
          return (
            panel.top >= header.bottom + 7 &&
            panel.bottom <= composer.top &&
            composer.bottom <= window.innerHeight
          );
        }),
      )
      .toBe(true);
    await expect(
      picker.getByLabel("YouTube link", { exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await guest.screenshot({
      path: testInfo.outputPath(`touch-attachment-picker-${height}.png`),
      animations: "disabled",
    });
  }
  await picker
    .getByRole("button", { name: "Insert video", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await expect(box.getByTitle("YouTube video")).toBeVisible();
  await expect(box).not.toBeFocused();
});

test("viewport resizing keeps a pinned chat at the bottom without moving a reader", async ({
  browser,
}) => {
  const room = await isolatedRoom("E2E Keyboard");
  const seeder = await connectRawGuest("Keyboard Seeder", "198.51.100.43");
  try {
    expect((await seeder.join(room.slug)).ok).toBe(true);
    expect(
      (
        await seeder.send(
          Array.from({ length: 75 }, (_, index) => `Row${index + 1}`).join(
            "\n",
          ),
        )
      ).ok,
    ).toBe(true);
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    guestContexts.push(context);
    const guest = await context.newPage();
    await enterRoom(guest, room.name, "Keyboard Guest");
    await expect(
      guest.getByRole("log").getByText("Row75", { exact: false }),
    ).toBeVisible();
    await guest.evaluate(() =>
      Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      ),
    );
    const distanceFromBottom = () =>
      guest.evaluate(() => {
        const page = document.documentElement;
        return page.scrollHeight - page.scrollTop - page.clientHeight;
      });
    const settleLayout = () =>
      guest.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    await expect
      .poll(() =>
        guest.evaluate(() => {
          const page = document.documentElement;
          return page.scrollHeight - page.clientHeight;
        }),
      )
      .toBeGreaterThan(500);
    await expect.poll(distanceFromBottom).toBeLessThan(2);
    const box = guest.getByRole("textbox", { name: "Message", exact: true });
    await box.tap();
    await expect(box).toBeFocused();
    await guest.getByRole("log").evaluate((log) => {
      log.style.paddingBottom = "128px";
      window.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(distanceFromBottom).toBeLessThan(2);
    for (const height of [480, 844, 480, 844]) {
      await guest.setViewportSize({ width: 390, height });
      await settleLayout();
      await expect.poll(distanceFromBottom).toBeLessThan(2);
    }
    await guest.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.addEventListener("scroll", () => resolve(), { once: true });
          window.scrollTo(0, 100);
        }),
    );
    await expect.poll(() => guest.evaluate(() => window.scrollY)).toBe(100);
    expect(await distanceFromBottom()).toBeGreaterThan(120);
    for (const height of [480, 844]) {
      await guest.setViewportSize({ width: 390, height });
      await settleLayout();
      await expect.poll(() => guest.evaluate(() => window.scrollY)).toBe(100);
    }
  } finally {
    seeder.close();
  }
});

test("only modal dialogs lock page scrolling, not composer pickers", async ({
  browser,
}) => {
  const guest = await newGuest(browser);
  const root = guest.locator("html");
  await guest.goto("/");
  await guest.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
  const join = guest.getByRole("dialog");
  await expect(join).toHaveAttribute("aria-modal", "true");
  await expect(root).toHaveCSS("overflow", "hidden");
  await guest.getByRole("textbox", { name: "Nickname" }).fill("Scroll Guest");
  await acceptTerms(guest);
  await guest.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(join).toHaveCount(0);

  for (const width of [1280, 390]) {
    await guest.setViewportSize({ width, height: 800 });
    await expect(root).toHaveCSS("scrollbar-gutter", "stable");
    await guest
      .getByRole("button", { name: "Add attachments", exact: true })
      .click();
    const picker = guest.getByRole("dialog", {
      name: "Add attachments",
      exact: true,
    });
    await expect(picker).toBeVisible();
    await expect(picker).not.toHaveAttribute("aria-modal", "true");
    await expect(root).not.toHaveCSS("overflow", "hidden");
    await expect(root).toHaveCSS("scrollbar-gutter", "stable");
    await picker.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(root).toHaveCSS("scrollbar-gutter", "stable");
  }
});

test("private chat back returns to the room and leaving is an action in the room menu", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  await expect(alice.getByRole("button", { name: "Leave room" })).toHaveCount(
    0,
  );
  await alice
    .getByRole("button", { name: "Open private chat with Bob" })
    .click();
  await expect(
    alice.getByRole("heading", { name: "Direct message with Bob" }),
  ).toBeVisible();
  await expectPickerAligned(alice);
  await alice.getByRole("button", { name: "Back to the room" }).click();
  await expect(alice.getByRole("log", { name: LOUNGE.name })).toBeVisible();
  await alice
    .getByRole("button", { name: "Open private chat with Bob" })
    .click();
  await leaveRoom(alice);
});

test("typing in header search keeps the page scroll position", async ({
  browser,
}) => {
  const room = await isolatedRoom("E2E Search Scroll");
  const guest = await newGuest(browser);
  await enterRoom(guest, room.name, "Search Scroll Guest");
  await send(guest, "Stable search target");
  await guest.addStyleTag({ content: '[role="log"] { min-height: 2000px; }' });
  await expect(guest.locator("[data-room-search]")).toHaveCSS(
    "overflow-anchor",
    "none",
  );

  for (const width of [390, 1280]) {
    await guest.setViewportSize({ width, height: 720 });
    const field = guest.getByRole("combobox", { name: "Search messages" });
    await field.click();
    await guest.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(() => guest.evaluate(() => window.scrollY)).toBe(400);
    await field.pressSequentially(" ");
    await expect.poll(() => guest.evaluate(() => window.scrollY)).toBe(400);
    for (const query of ["Stable search target", "No matching message"]) {
      await field.press("ControlOrMeta+A");
      await field.press("Backspace");
      await field.pressSequentially(query, { delay: 30 });
      await expect(
        guest.getByRole("region", { name: `Search in ${room.name}` }),
      ).toBeVisible();
      await expect.poll(() => guest.evaluate(() => window.scrollY)).toBe(400);
    }
    await field.press("ControlOrMeta+A");
    await field.press("Backspace");
    await expect.poll(() => guest.evaluate(() => window.scrollY)).toBe(400);
    await expect(
      guest.getByRole("button", { name: "Scroll to the latest messages" }),
    ).toBeVisible();
    await guest.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(
      guest.getByRole("button", { name: "Scroll to the latest messages" }),
    ).toHaveCount(0);
    const tracker = await guest.evaluateHandle(() => {
      const top = window.scrollY;
      const problems: string[] = [];
      const onScroll = () => {
        if (window.scrollY !== top) problems.push("page moved");
      };
      const observer = new MutationObserver(() => {
        if (
          document.querySelector(
            'button[aria-label="Scroll to the latest messages"]',
          )
        ) {
          problems.push("scroll button appeared");
        }
      });
      window.addEventListener("scroll", onScroll);
      observer.observe(document.body, { childList: true, subtree: true });
      return {
        problems,
        dispose() {
          window.removeEventListener("scroll", onScroll);
          observer.disconnect();
        },
      };
    });
    try {
      await field.pressSequentially(" Stable search target", { delay: 30 });
      await field.press("ControlOrMeta+A");
      await field.press("Backspace");
      await guest.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      expect(await tracker.evaluate((state) => state.problems)).toEqual([]);
    } finally {
      await tracker.evaluate((state) => state.dispose());
      await tracker.dispose();
    }
  }
});

test("room search finds public and private text without image URLs on mobile and desktop", async ({
  browser,
}, testInfo) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  const query = `search ${Date.now()}`;
  const publicText = `${query} public message ${"longword".repeat(8)}`;
  const privateText = `${query} private message`;
  const outgoingText = `${query} outgoing private message`;
  const imageUrl = "https://media1.giphy.com/media/URL_ONLY_TOKEN/200.gif";
  await send(alice, `${publicText}\n${imageUrl}`);
  await expect(
    alice
      .getByRole("log")
      .locator("[data-nav-id]")
      .filter({ hasText: publicText })
      .getByRole("img", { name: "GIF", exact: true }),
  ).toBeVisible();
  await bob
    .getByRole("button", { name: "Open private chat with Alice" })
    .click();
  await send(bob, `${privateText}\n${imageUrl}`, "Alice");
  await expect(alice.getByRole("log")).toContainText(privateText);
  await expect(
    alice
      .getByRole("log")
      .locator("[data-nav-id]")
      .filter({ hasText: privateText })
      .getByRole("img", { name: "GIF", exact: true }),
  ).toBeVisible();
  await alice
    .getByRole("button", { name: "Open private chat with Bob" })
    .click();
  await send(alice, outgoingText, "Bob");
  await alice.getByRole("button", { name: "Back to the room" }).click();
  await expect(alice.getByRole("log")).toContainText(outgoingText);

  const search = alice.getByRole("combobox", { name: "Search messages" });
  await search.fill("URL_ONLY_TOKEN");
  await expect(
    alice.getByRole("region", { name: `Search in ${LOUNGE.name}` }),
  ).toContainText("No messages found.");

  for (const width of [273, 390, 1280]) {
    await alice.setViewportSize({ width, height: width === 390 ? 480 : 844 });
    const field = alice.getByRole("combobox", { name: "Search messages" });
    await field.clear();
    await field.click();
    await expect(
      alice.getByRole("listbox", { name: "Message results" }),
    ).toHaveCount(0);
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await field.fill("   ");
    await expect(
      alice.getByRole("listbox", { name: "Message results" }),
    ).toHaveCount(0);
    await field.fill(query.toUpperCase());
    const dropdown = alice.getByRole("region", {
      name: `Search in ${LOUNGE.name}`,
    });
    const results = dropdown.getByRole("listbox", { name: "Message results" });
    await expect(results.getByRole("option")).toHaveCount(3);
    const searchBounds = await dropdown.boundingBox();
    const composerBounds = await alice
      .locator("form[data-composer]:visible")
      .boundingBox();
    expect(searchBounds!.y + searchBounds!.height).toBeLessThanOrEqual(
      composerBounds!.y - 8 + 1,
    );
    await expect(results).toContainText(publicText);
    await expect(results).toContainText(privateText);
    await expect(results).not.toContainText(/URL_ONLY_TOKEN|giphy/);
    await expect(
      results.getByRole("img", { name: "Private message" }),
    ).toHaveCount(0);
    const publicResult = results
      .getByRole("option")
      .filter({ hasText: publicText });
    const privateResult = results
      .getByRole("option")
      .filter({ hasText: privateText });
    const outgoingResult = results
      .getByRole("option")
      .filter({ hasText: outgoingText });
    await expect(
      outgoingResult.getByText("Direct message to Bob", { exact: true }),
    ).toBeVisible();
    await expect(
      privateResult.getByText("Direct message from Bob", { exact: true }),
    ).toBeVisible();
    await expect(outgoingResult).toHaveCSS("justify-content", "flex-end");
    await expect(publicResult).toHaveCSS("justify-content", "flex-end");
    await expect(privateResult).toHaveCSS("justify-content", "flex-start");
    await expect(
      privateResult.getByText("Private message", { exact: true }),
    ).toHaveClass("sr-only");
    const publicBubble = alice
      .getByRole("log")
      .locator("[data-nav-id]")
      .filter({ hasText: publicText })
      .locator('[class~="bg-sent"]');
    const privateBubble = alice
      .getByRole("log")
      .locator("[data-nav-id]")
      .filter({ hasText: privateText })
      .locator('[class~="bg-amber-400/10"]');
    await expect(publicResult.locator('[class~="bg-sent"]')).toHaveCSS(
      "background-color",
      await publicBubble.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
    await expect(privateResult.locator('[class~="bg-amber-400/10"]')).toHaveCSS(
      "background-color",
      await privateBubble.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
    await expect(privateResult.locator('[class~="border-dashed"]')).toHaveCSS(
      "border-top-style",
      "dashed",
    );
    await expect(results.locator("mark")).toHaveText([query, query, query]);
    const bounds = await dropdown.boundingBox();
    const inputBounds = await field.boundingBox();
    const header = alice.locator("header");
    await expect(header).toHaveCSS("height", "56px");
    await expect(field).toHaveCSS(
      "border-top-color",
      await header
        .locator("..")
        .evaluate((element) => getComputedStyle(element).borderBottomColor),
    );
    const placeholderColor = await field.evaluate(
      (element) => getComputedStyle(element, "::placeholder").color,
    );
    if (width < 640) {
      expect(placeholderColor).toBe("rgba(0, 0, 0, 0)");
    } else {
      expect(placeholderColor).not.toBe("rgba(0, 0, 0, 0)");
    }
    const headerBounds = (await header.boundingBox())!;
    expect(inputBounds!.width).toBeGreaterThanOrEqual(72);
    expect(inputBounds!.y).toBeGreaterThanOrEqual(headerBounds.y);
    expect(inputBounds!.y + inputBounds!.height).toBeLessThanOrEqual(
      headerBounds.y + headerBounds.height,
    );
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (width >= 640) {
      expect(
        Math.abs(
          bounds!.x +
            bounds!.width / 2 -
            (inputBounds!.x + inputBounds!.width / 2),
        ),
      ).toBeLessThanOrEqual(1);
    }
    expect(bounds!.y).toBeGreaterThanOrEqual(
      headerBounds.y + headerBounds.height + 5,
    );
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(
      await dropdown.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await alice.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await alice.screenshot({
      path: testInfo.outputPath(`room-search-${width}.png`),
    });
    const selectedText =
      width === 273 ? publicText : width === 390 ? privateText : outgoingText;
    const result = results
      .getByRole("option")
      .filter({ hasText: selectedText });
    if (width === 390) {
      await result.click();
    } else {
      await field.press("ArrowDown");
      if (width === 273) {
        await alice.keyboard.press("ArrowDown");
        await alice.keyboard.press("ArrowDown");
      }
      await expect(result).toBeFocused();
      await alice.keyboard.press("Enter");
    }
    await expect(dropdown).toHaveCount(0);
    const original = alice
      .getByRole("log")
      .locator("[data-nav-id]")
      .filter({ hasText: selectedText });
    await expect(original).toBeFocused();
    await expect(original).toHaveAttribute("data-search-match", "");
  }
});

test("messages align with the composer and its divider", async ({
  browser,
}, testInfo) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  const incomingText = `Incoming layout ${Date.now()}`;
  const outgoingText = `Outgoing layout ${Date.now()}`;
  const incomingFixture = `${incomingText}\n\n${"More message text\n".repeat(20)}`;
  await send(bob, incomingFixture);
  await send(alice, outgoingText);
  const log = alice.getByRole("log", { name: LOUNGE.name });
  await expect(
    log.locator("[data-nav-id]").filter({ hasText: incomingText }).locator("p"),
  ).toHaveJSProperty("textContent", incomingFixture.trim());
  const composer = alice
    .getByRole("textbox", { name: "Message", exact: true })
    .locator("xpath=ancestor::form");
  const bar = composer.locator("..");

  for (const width of [390, 1280]) {
    await alice.setViewportSize({ width, height: 844 });
    await alice.evaluate(() =>
      Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      ),
    );
    const formBounds = await composer.boundingBox();
    const avatarBounds = await log
      .locator('li[data-side="left"]')
      .filter({ hasText: incomingText })
      .locator("[data-avatar], [data-picture]")
      .first()
      .boundingBox();
    const ownBounds = await log
      .locator("[data-nav-id]")
      .filter({ hasText: outgoingText })
      .boundingBox();
    expect(Math.abs(avatarBounds!.x - formBounds!.x)).toBeLessThan(1);
    expect(
      Math.abs(
        ownBounds!.x + ownBounds!.width - formBounds!.x - formBounds!.width,
      ),
    ).toBeLessThan(1);
    expect(
      await bar.evaluate(
        (element) => getComputedStyle(element, "::before").borderTopWidth,
      ),
    ).toBe("1px");
    const barBounds = (await bar.boundingBox())!;
    expect(barBounds.y + barBounds.height).toBeLessThanOrEqual(844);
    await alice.mouse.wheel(0, -300);
    await alice.screenshot({
      path: testInfo.outputPath(`message-layout-${width}.png`),
    });
    await alice.setViewportSize({ width, height: 300 });
    await alice.evaluate(() => window.scrollTo(0, 0));
    const latest = alice.getByRole("button", {
      name: "Scroll to the latest messages",
      exact: true,
    });
    await expect(latest).toBeVisible();
    const buttonBounds = await latest.boundingBox();
    const resizedForm = await composer.boundingBox();
    expect(Math.abs(buttonBounds!.x - resizedForm!.x + 1)).toBeLessThan(1);
    expect(buttonBounds!.width).toBe(38);
  }
});

test("the composer highlights keyboard focus but not pointer focus", async ({
  browser,
}) => {
  const guest = await newGuest(browser);
  await enterRoom(guest, LOUNGE.name, "Focus Guest");
  const input = guest.getByRole("textbox", { name: "Message", exact: true });
  const box = input.locator("xpath=ancestor::form").locator(":scope > div");
  const neutral = "rgb(66, 66, 66)";
  const focus = "rgb(173, 173, 173)";
  const picker = guest.getByRole("button", {
    name: "Add attachments",
    exact: true,
  });

  await input.click();
  await expect(input).toBeFocused();
  await expect(box).toHaveCSS("border-top-color", neutral);
  await expect(box).toHaveCSS("outline-style", "none");
  const bounds = await box.boundingBox();
  await input.press("Shift+Tab");
  await expect(picker).toBeFocused();
  await expect(picker).toHaveCSS("outline-width", "2px");
  await expect(picker).toHaveCSS("outline-color", focus);
  await guest.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await expect(box).toHaveCSS("border-top-color", neutral);
  await expect(box).toHaveCSS("outline-style", "solid");
  await expect(box).toHaveCSS("outline-width", "2px");
  await expect(box).toHaveCSS("outline-color", focus);
  expect(await box.boundingBox()).toEqual(bounds);
  await input.press("Shift+Tab");
  await picker.press("Enter");
  const search = guest.getByRole("dialog").getByRole("searchbox");
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS("outline-width", "2px");
  await expect(search).toHaveCSS("outline-color", focus);
  await search.click();
  await expect(search).toHaveCSS("outline-style", "none");
  await search.press("Escape");
  await input.click();
  await expect(input).toBeFocused();
  await expect(box).toHaveCSS("border-top-color", neutral);
  await expect(box).toHaveCSS("outline-style", "none");
});

test("signed-out settings open directly from the header", async ({
  browser,
}, testInfo) => {
  const guest = await newGuest(browser);
  await guest.goto("/");

  for (const width of [1280, 375, 320]) {
    await guest.setViewportSize({ width, height: 800 });
    const settings = guest.getByRole("button", {
      name: "Settings",
      exact: true,
    });
    await expect(settings).toHaveAttribute("title", "Settings");
    await expect(settings).toHaveAttribute("aria-haspopup", "dialog");
    await expect(
      guest.getByRole("button", { name: "Menu", exact: true }),
    ).toHaveCount(0);
    await settings.click();
    const dialog = guest.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    const languages = dialog.locator('input[name="settings-language"] + span');
    await expect
      .poll(() =>
        languages.evaluateAll((options) =>
          options.map((option) => getComputedStyle(option).flexDirection),
        ),
      )
      .toEqual(Array(3).fill(width === 1280 ? "row" : "column"));
    expect(
      await languages.evaluateAll((options) =>
        options.every((option) => option.scrollWidth <= option.clientWidth),
      ),
    ).toBe(true);
    await dialog
      .locator("fieldset")
      .first()
      .screenshot({
        path: testInfo.outputPath(`settings-languages-${width}.png`),
        animations: "disabled",
      });
    await expect(guest.getByRole("menu")).toHaveCount(0);
    await guest.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeFocused();
  }
});

test("reloading settings does not focus an individual setting", async ({
  browser,
}) => {
  const guest = await newGuest(browser);
  await enterRoom(guest, LOUNGE.name, "Settings Focus Guest");
  await guest
    .getByRole("button", { name: "Account menu: Settings Focus Guest" })
    .click();
  await guest.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const dialog = guest.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeFocused();
  await expect(guest).toHaveURL(/dialog=settings/);

  await guest.reload();

  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(
    dialog.getByRole("checkbox", { name: "Private message sounds" }),
  ).not.toBeFocused();
  await guest.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
});

test("the composer background has a top border matching the header", async ({
  browser,
}) => {
  const guest = await newGuest(browser);
  await enterRoom(guest, LOUNGE.name, "Border Guest");

  for (const width of [1280, 375, 320]) {
    await guest.setViewportSize({ width, height: 800 });
    const headerColor = await guest
      .locator("header")
      .evaluate(
        (element) => getComputedStyle(element.parentElement!).borderBottomColor,
      );
    const border = await guest
      .locator(".composer-surface:visible")
      .evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return {
          width: style.borderTopWidth,
          style: style.borderTopStyle,
          color: style.borderTopColor,
        };
      });
    expect(border).toEqual({
      width: "1px",
      style: "solid",
      color: headerColor,
    });
  }
});

test("neon glass menus and modals preserve focus and accessibility fallbacks", async ({
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  const guest = await newGuest(browser);
  await enterRoom(guest, LOUNGE.name, "Glass Guest");
  for (const width of [1280, 375, 320]) {
    await guest.setViewportSize({ width, height: 800 });
    await guest
      .getByRole("button", { name: "Account menu: Glass Guest" })
      .click();
    const menu = guest.getByRole("menu");
    const settings = menu.getByRole("menuitem", {
      name: "Settings",
      exact: true,
    });
    await expect(menu).toBeVisible();
    const rim = await menu.evaluate((element) => {
      return {
        before: getComputedStyle(element, "::before").content,
        after: getComputedStyle(element, "::after").content,
        border: getComputedStyle(element).borderTopWidth,
      };
    });
    expect(rim).toEqual({ before: "none", after: "none", border: "1px" });
    await settings.hover();
    await expect
      .poll(() =>
        settings.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .not.toBe("none");
    await guest.screenshot({
      path: testInfo.outputPath(`glass-menu-${width}.png`),
      animations: "disabled",
    });
    await guest.keyboard.press("Home");
    await expect(menu.getByRole("menuitem").first()).toHaveAttribute(
      "data-focus",
      "",
    );
    await guest.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await expect
      .poll(() =>
        menu.evaluate(
          (element) => getComputedStyle(element, "::after").content,
        ),
      )
      .toBe("none");
    await expect
      .poll(() =>
        settings.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .toBe("none");
    expect(
      await settings.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ).toBe("0s");
    await guest.emulateMedia({
      forcedColors: "none",
      reducedMotion: "no-preference",
    });
    await settings.click();
    const dialog = guest.getByRole("dialog", { name: "Settings", exact: true });
    await expect(dialog).toBeVisible();
    const panel = dialog.locator(".glass-surface");
    await panel.evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const activity = dialog.getByRole("checkbox", {
      name: "Show a message in the chat when someone joins or leaves the room.",
    });
    await expect(activity).toHaveCSS("padding-left", "8px");
    await expect(activity).toHaveCSS("padding-right", "8px");
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    for (const label of [
      "Show a message in the chat when someone joins or leaves the room.",
      "Private message sounds",
      "Warnings",
      "People joining",
    ]) {
      const checkbox = dialog.getByRole("checkbox", {
        name: label,
        exact: true,
      });
      await expect(checkbox).toHaveCSS(
        "min-height",
        width >= 640 ? "36px" : "44px",
      );
      await checkbox.scrollIntoViewIfNeeded();
      const target = await checkbox.boundingBox();
      expect(target).not.toBeNull();
      const position = { x: target!.width - 6, y: target!.height / 2 };
      await expect(checkbox).not.toBeChecked();
      await checkbox.click({ position });
      await expect(checkbox).toBeChecked();
      await checkbox.click({ position });
      await expect(checkbox).not.toBeChecked();
    }
    const sound = dialog.getByRole("button", {
      name: "Sound for Private message sounds",
    });
    await sound.click();
    const listbox = guest.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(listbox).toBeFocused();
    const optionsBounds = await listbox.boundingBox();
    expect(optionsBounds).not.toBeNull();
    expect(optionsBounds!.x).toBeGreaterThanOrEqual(0);
    expect(optionsBounds!.x + optionsBounds!.width).toBeLessThanOrEqual(width);
    await guest.screenshot({
      path: testInfo.outputPath(`glass-sound-options-${width}.png`),
      animations: "disabled",
    });
    await guest.keyboard.press("Home");
    await guest.keyboard.press("ArrowDown");
    await guest.keyboard.press("Enter");
    await expect(sound).toHaveText("Bell");
    await expect(sound).toBeFocused();
    await sound.click();
    await expect(listbox).toBeFocused();
    await guest.keyboard.press("Escape");
    await expect(listbox).toHaveCount(0);
    await expect(dialog).toBeVisible();
    const warnings = dialog.getByRole("checkbox", {
      name: "Warnings",
      exact: true,
    });
    await warnings.focus();
    await warnings.press("Space");
    await expect(warnings).toBeChecked();
    await dialog.getByText("Warnings", { exact: true }).click();
    await expect(warnings).not.toBeChecked();
    const preview = dialog.getByRole("button", {
      name: "Preview sound",
      exact: true,
    });
    await preview.hover();
    await expect
      .poll(() =>
        preview.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .toMatch(/(?:\/\s*0\.1|,\s*0\.1\))/);
    await expect
      .poll(() =>
        preview.evaluate(
          (element) => getComputedStyle(element, "::after").opacity,
        ),
      )
      .toBe("1");
    expect(
      await preview.evaluate((element) => {
        const outline = getComputedStyle(element, "::after");
        return {
          width: outline.borderTopWidth,
          matchingFill:
            outline.backgroundColor ===
            getComputedStyle(element).backgroundColor,
        };
      }),
    ).toEqual({ width: "2px", matchingFill: true });
    await activity.hover();
    await guest.screenshot({
      path: testInfo.outputPath(`glass-settings-${width}.png`),
      animations: "disabled",
    });
    const session = await guest.context().newCDPSession(guest);
    await session.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    await expect
      .poll(() =>
        panel.evaluate((element) => getComputedStyle(element).backdropFilter),
      )
      .toBe("none");
    expect(
      await panel.evaluate(
        (element) => getComputedStyle(element, "::before").content,
      ),
    ).toBe("none");
    expect(
      await panel.evaluate(
        (element) => getComputedStyle(element, "::after").content,
      ),
    ).toBe("none");
    await session.send("Emulation.setEmulatedMedia", { features: [] });
    await session.detach();
    await guest.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  await guest.context().close();
});

test("header dropdowns stay within the composer and viewport bounds", async ({
  browser,
}) => {
  const guest = await newGuest(browser);
  await enterRoom(guest, LOUNGE.name, "Menu Guest");
  await fillMessage(
    guest.getByRole("textbox", { name: "Message", exact: true }),
    "Draft line one\nDraft line two\nDraft line three",
  );

  for (const viewport of [
    { width: 273, height: 360 },
    { width: 390, height: 480 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    await guest.setViewportSize(viewport);
    for (const peopleOpen of viewport.width < 768 ? [false, true] : [false]) {
      if (peopleOpen) {
        await guest
          .getByRole("button", { name: "People and direct messages" })
          .click();
      }

      for (const name of ["Account menu: Menu Guest", LOUNGE.name]) {
        await guest.getByRole("button", { name, exact: true }).click();
        const dropdown = guest.getByRole("menu");
        await expect(dropdown).toBeVisible();
        const bounds = await dropdown.boundingBox();
        const composer = await guest
          .locator("#message")
          .locator("xpath=ancestor::form")
          .boundingBox();
        expect(bounds).not.toBeNull();
        expect(composer).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
          composer!.y - 8 + 1,
        );
        if (viewport.width < 768) {
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
            composer!.x + composer!.width + 1,
          );
          if (name !== LOUNGE.name) {
            await expect
              .poll(async () => {
                const panel = await dropdown.boundingBox();
                const box = await guest
                  .locator("#message")
                  .locator("xpath=ancestor::form")
                  .boundingBox();
                return panel && box
                  ? Math.abs(panel.x + panel.width - box.x - box.width)
                  : Infinity;
              })
              .toBeLessThan(1);
          }
        }
        await guest.keyboard.press("Escape");
      }

      if (peopleOpen) {
        await expect(
          guest.getByRole("button", { name: "People and direct messages" }),
        ).toHaveAttribute("aria-expanded", "false");
      }
    }

    if (viewport.width < 768) {
      const toggle = guest.getByRole("button", {
        name: "People and direct messages",
      });
      await toggle.click();
      const panel = guest.locator("#room-panel-sheet");
      await panel.getByRole("searchbox", { name: "Search people" }).click();
      await expect(panel).toBeVisible();
      await guest
        .getByRole("textbox", { name: "Message", exact: true })
        .click();
      await expect(panel).toHaveCount(0);
      await toggle.click();
      await expectPickerAligned(guest);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    } else {
      await expectPickerAligned(guest);
    }
  }
});

for (const width of [390, 1280]) {
  test(`YouTube videos preview, insert and reach another guest at ${width}px`, async ({
    browser,
  }, testInfo) => {
    const guest = await newGuest(browser);
    const reader = await newGuest(browser);
    await guest.setViewportSize({ width, height: 844 });
    await reader.setViewportSize({ width, height: 844 });
    await enterRoom(guest, LOUNGE.name, "YouTube Guest");
    await enterRoom(reader, LOUNGE.name, "YouTube Reader");
    const box = guest.getByRole("textbox", { name: "Message", exact: true });
    const above = `Video above ${width} ${Date.now()}`;
    const below = `Video below ${width}`;
    const embed = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ";
    await reader.route(`${embed}?**`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body><main>YouTube embed fixture</main></body></html>",
      }),
    );
    await fillMessage(box, above);
    await guest.getByRole("button", { name: "Add attachments" }).click();
    await guest.getByRole("tab", { name: "YouTube", exact: true }).click();
    const picker = guest.getByRole("dialog", { name: "Add attachments" });
    const link = guest.getByLabel("YouTube link", { exact: true });
    const insert = guest.getByRole("button", {
      name: "Insert video",
      exact: true,
    });
    await expect(insert).toHaveCount(0);
    await link.fill("https://example.com/watch?v=aqz-KE-bpKQ");
    await expect(guest.getByRole("alert")).toContainText(
      "Enter a valid YouTube video link.",
    );
    await expect(picker.getByTitle("YouTube video")).toHaveCount(0);
    await expect(insert).toHaveCount(0);
    await link.fill("https://youtu.be/aqz-KE-bpKQ?si=ignored");
    const preview = picker.getByRole("img", { name: "YouTube video" });
    await expect(preview).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
    );
    await expect(preview).toHaveJSProperty("naturalWidth", 480);
    await expect(preview).toBeInViewport();
    await expect(picker.locator("iframe")).toHaveCount(0);
    await expect(
      insert.getByRole("img", { name: "YouTube video" }),
    ).toHaveCount(1);
    await expect(picker.getByText("Insert video", { exact: true })).toHaveCount(
      0,
    );
    await guest.screenshot({
      path: testInfo.outputPath(`youtube-picker-${width}.png`),
      animations: "disabled",
    });
    await insert.click();
    await expect(box).toBeFocused();
    await guest.keyboard.type(below);
    const video = box.getByTitle("YouTube video");
    await expect(video).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
    );
    await expect(video).toHaveJSProperty("naturalWidth", 480);
    const bounds = await video.boundingBox();
    const editorBounds = await box.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(100);
    expect(bounds!.height).toBeGreaterThan(60);
    expect(bounds!.x).toBeGreaterThanOrEqual(editorBounds!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      editorBounds!.x + editorBounds!.width + 1,
    );
    await guest.screenshot({
      path: testInfo.outputPath(`youtube-draft-${width}.png`),
      animations: "disabled",
    });
    for (let index = 0; index < 12; index += 1) {
      await guest.keyboard.press("Shift+Enter");
      await guest.keyboard.insertText(`Scroll line ${index}`);
    }
    const shell = guest.locator(".composer-focus").filter({ has: box });
    await expect
      .poll(() =>
        shell.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      )
      .toBeTruthy();
    expect(
      await box.evaluate((element) => getComputedStyle(element).overflowY),
    ).not.toBe("auto");
    const controls = shell.locator("[data-controls]").filter({
      has: guest.getByRole("button", { name: "Send", exact: true }),
    });
    const attachments = shell.locator("[data-controls]").filter({
      has: guest.getByRole("button", {
        name: "Add attachments",
        exact: true,
      }),
    });
    for (const scrollTop of [0, 100000]) {
      await shell.evaluate((element, value) => {
        element.scrollTop = value;
      }, scrollTop);
      const shellBounds = (await shell.boundingBox())!;
      const controlsBounds = (await controls.boundingBox())!;
      const attachmentBounds = (await attachments.boundingBox())!;
      const scrollbar = await shell.evaluate(
        (element) =>
          element.getBoundingClientRect().width - element.clientWidth,
      );
      expect(
        Math.abs(
          shellBounds.y +
            shellBounds.height -
            controlsBounds.y -
            controlsBounds.height,
        ),
      ).toBeLessThan(2);
      expect(
        shellBounds.x +
          shellBounds.width -
          controlsBounds.x -
          controlsBounds.width,
      ).toBeLessThanOrEqual(scrollbar + 2);
      expect(Math.abs(attachmentBounds.x - shellBounds.x)).toBeLessThan(2);
      expect(
        Math.abs(
          attachmentBounds.y +
            attachmentBounds.height -
            shellBounds.y -
            shellBounds.height,
        ),
      ).toBeLessThan(2);
      await expect(
        attachments.getByRole("button", {
          name: "Add attachments",
          exact: true,
        }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        controls.getByRole("button", { name: "Send", exact: true }),
      ).toBeInViewport({ ratio: 1 });
    }
    await guest.screenshot({
      path: testInfo.outputPath(`youtube-scroll-${width}.png`),
      animations: "disabled",
    });
    await guest.getByRole("button", { name: "Send", exact: true }).click();
    await expect(box.getByTitle("YouTube video")).toHaveCount(0);
    const received = reader
      .getByRole("log")
      .locator("[data-nav-id]")
      .filter({ hasText: above });
    await expect(received).toContainText(below);
    await expect(
      received.getByRole("img", { name: "YouTube video" }),
    ).toHaveJSProperty("naturalWidth", 480);
    await received
      .getByRole("button", { name: "Play video", exact: true })
      .click();
    const player = received.getByTitle("YouTube video");
    await expect(player).toHaveAttribute(
      "src",
      `${embed}?autoplay=1&playsinline=1`,
    );
    await expect(
      player.contentFrame().getByText("YouTube embed fixture", { exact: true }),
    ).toBeVisible();
    await expect(player).toHaveAttribute("allow", /autoplay/);
    await expect(player).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-presentation",
    );
    await expect(
      received.getByRole("link", { name: "Open on YouTube" }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    await expect(player).toBeVisible();
    const playerBounds = await player.boundingBox();
    expect(playerBounds!.x).toBeGreaterThanOrEqual(0);
    expect(playerBounds!.x + playerBounds!.width).toBeLessThanOrEqual(width);
    await reader.screenshot({
      path: testInfo.outputPath(`youtube-message-${width}.png`),
      animations: "disabled",
    });
  });

  test(`GIFs stay inside the editor with editable text above and below at ${width}px`, async ({
    browser,
  }, testInfo) => {
    const guest = await newGuest(browser);
    await guest.setViewportSize({ width, height: 844 });
    const gif = "https://media1.giphy.com/media/inline-test/200.gif";
    await guest.route("https://api.giphy.com/**", (route) =>
      route.fulfill({
        json: {
          data: [
            {
              id: "inline-test",
              title: "Inline test",
              images: {
                fixed_width: { url: gif, width: "200", height: "150" },
                fixed_height: { url: gif, width: "200", height: "150" },
              },
            },
          ],
          pagination: { total_count: 1, count: 1, offset: 0 },
        },
      }),
    );
    await guest.route(
      "https://media1.giphy.com/media/inline-test/**",
      (route) =>
        route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB3sAAAAASUVORK5CYII=",
            "base64",
          ),
        }),
    );
    await enterRoom(guest, LOUNGE.name, "GIF Guest");

    const box = guest.getByRole("textbox", { name: "Message", exact: true });
    const above = `Above ${width} ${Date.now()}`;
    const below = `Below ${width}`;
    await fillMessage(box, above);
    await guest.getByRole("button", { name: "Add attachments" }).click();
    await guest.getByRole("tab", { name: "GIFs", exact: true }).click();
    await guest.getByRole("button", { name: "Add GIF: Inline test" }).click();
    await expect(box).toBeFocused();
    await guest.keyboard.type(below);
    const image = box.getByRole("img", { name: "GIF", exact: true });
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty("naturalWidth", 1);
    const layout = await box.evaluate((element) => {
      const paragraph = element.querySelector("p")!;
      const first = document.createRange();
      first.selectNodeContents(paragraph.firstChild!);
      const last = document.createRange();
      last.selectNodeContents(paragraph.lastChild!);
      const gifBounds = element.querySelector("img")!.getBoundingClientRect();
      return {
        aboveBottom: first.getBoundingClientRect().bottom,
        belowTop: last.getBoundingClientRect().top,
        gifTop: gifBounds.top,
        gifBottom: gifBounds.bottom,
        scrollHeight: element.scrollHeight,
        height: element.clientHeight,
      };
    });
    expect(layout.aboveBottom).toBeLessThanOrEqual(layout.gifTop);
    expect(layout.belowTop).toBeGreaterThanOrEqual(layout.gifBottom);
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height + 1);
    await guest.screenshot({
      path: testInfo.outputPath(`inline-gif-${width}.png`),
    });
    await guest.getByRole("button", { name: "Send", exact: true }).click();
    const sent = guest
      .getByRole("log")
      .locator("[data-nav-id]")
      .filter({ hasText: above });
    await expect(sent).toContainText(below);
    await expect(sent.getByRole("img", { name: "GIF" })).toBeVisible();
    await expect(box.getByRole("img")).toHaveCount(0);
  });
}

test(
  "two guests chat in real time and see each other come and go",
  { tag: "@smoke" },
  async ({ browser }) => {
    const alice = await newGuest(browser);
    const bob = await newGuest(browser);

    await enterRoom(alice, LOUNGE.name, "Alice");
    await expect(
      alice.getByRole("heading", { name: "In this room (1 of 5)" }),
    ).toBeVisible();

    await enterRoom(bob, LOUNGE.name, "Bob");
    await expect(
      alice.getByRole("heading", { name: "In this room (2 of 5)" }),
    ).toBeVisible();
    await expect(
      bob.getByRole("heading", { name: "In this room (2 of 5)" }),
    ).toBeVisible();

    // Message text must be shown literally, never interpreted as HTML.
    const markup = `<img src=x onerror="document.title='pwned'">`;
    await send(bob, markup);
    await expect(alice.getByRole("log")).toContainText(markup);
    // The guests' own pictures are images, so it is the one in the message that must not be there.
    await expect(alice.locator('img[src="x"]')).toHaveCount(0);
    await expect(alice).not.toHaveTitle(/pwned/);

    await send(alice, "Hi Bob!");
    await expect(bob.getByRole("log")).toContainText("Hi Bob!");

    await leaveRoom(bob);
    await expect(
      alice.getByRole("heading", { name: "In this room (1 of 5)" }),
    ).toBeVisible();
  },
);

test("a guest whose connection drops is reconnected to the same room", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);

  // Proxy Alice's real WebSocket so the test can cut it, like a network failure would.
  const connections: { close: () => Promise<void> }[] = [];
  await alice.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    connections.push({
      close: async () => {
        await ws.close();
        await server.close();
      },
    });
  });

  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  await expect(
    alice.getByRole("heading", { name: "In this room (2 of 5)" }),
  ).toBeVisible();

  await send(bob, "before the drop");
  await expect(alice.getByRole("log")).toContainText("before the drop");

  const beforeDrop = connections.length;
  await Promise.all(connections.map((connection) => connection.close()));

  await expect(alice.getByRole("status")).toHaveText(
    "Connection lost. Reconnecting…",
  );
  // Back in the same room, with the history that was on screen still there.
  await expect(alice.getByRole("status")).toHaveCount(0);
  await expect(
    alice.getByRole("heading", { name: LOUNGE.name, level: 2 }),
  ).toBeVisible();
  await expect(alice.getByRole("log")).toContainText("before the drop");
  expect(connections.length).toBeGreaterThan(beforeDrop);

  // Bob sees Alice leave and come back as a member, and they can talk again in both directions.
  await expect(
    bob.getByRole("heading", { name: "In this room (2 of 5)" }),
  ).toBeVisible();
  await send(bob, "welcome back");
  await expect(alice.getByRole("log")).toContainText("welcome back");
  await send(alice, "I'm back");
  await expect(bob.getByRole("log")).toContainText("I'm back");
});

for (const interruption of ["suspended", "offline"] as const) {
  test(`a ${interruption} mobile tab preserves recovery until it returns to the foreground`, async ({
    browser,
  }) => {
    const alice = await newGuest(browser);
    await alice.setViewportSize({ width: 390, height: 844 });
    const bob = await newGuest(browser);
    const connections: { close: () => Promise<void> }[] = [];
    await alice.routeWebSocket(/socket\.io/, (ws) => {
      const server = ws.connectToServer();
      connections.push({
        close: async () => {
          await ws.close();
          await server.close();
        },
      });
    });
    await enterRoom(alice, LOUNGE.name, "Alice");
    await enterRoom(bob, LOUNGE.name, "Bob");
    const missed = `While mobile was ${interruption} ${Date.now()}`;
    await alice.clock.install();
    if (interruption === "offline") {
      await alice.bringToFront();
      await alice.context().setOffline(true);
      expect(await alice.evaluate(() => navigator.onLine)).toBe(false);
      expect(await alice.evaluate(() => document.visibilityState)).toBe(
        "visible",
      );
    } else
      await alice.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await Promise.all(connections.map((connection) => connection.close()));
    await expect(alice.getByRole("status")).toHaveText(
      "Connection lost. Reconnecting…",
    );
    await expect(
      bob.getByRole("heading", { name: "In this room (1 of 5)" }),
    ).toBeVisible();
    await send(bob, missed);
    await alice.clock.fastForward(300_000);
    await expect(alice.getByRole("status")).toHaveText(
      "Connection lost. Reconnecting…",
    );
    if (interruption === "offline") await alice.context().setOffline(false);
    else
      await alice.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await expect(alice.getByRole("status")).toHaveCount(0);
    await expect(
      alice.getByRole("log").getByText(missed, { exact: true }),
    ).toHaveCount(1);
    await send(alice, `Mobile restored ${missed}`);
    await expect(bob.getByRole("log")).toContainText(
      `Mobile restored ${missed}`,
    );
  });
}

test("a guest who joins later sees what was said earlier in the room", async ({
  browser,
}) => {
  // The room's history outlives a test, so the message is made unique to this run.
  const earlier = `said before you arrived ${Date.now()}`;
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);

  await enterRoom(alice, LOUNGE.name, "Alice");
  await send(alice, earlier);
  await expect(alice.getByRole("log")).toContainText(earlier);

  await enterRoom(bob, LOUNGE.name, "Bob");

  await expect(bob.getByRole("log")).toContainText(earlier);
  await expect(bob.getByRole("log").getByText(earlier)).toHaveCount(1);
});

test("a guest reacts to a message, everyone sees it, and a guest who joins later does too", async ({
  browser,
}) => {
  const text = `react to this ${Date.now()}`;
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  const carol = await newGuest(browser);

  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  await send(alice, text);
  await expect(bob.getByRole("log")).toContainText(text);

  // The quick reactions show when the message is hovered.
  const bobsRow = bob.getByRole("listitem").filter({ hasText: text });
  const bar = bobsRow.locator("[data-bar]");
  const avatar = await bobsRow.locator("img").first().boundingBox();
  const bubble = await bobsRow.getByText(text, { exact: true }).boundingBox();
  expect(avatar).not.toBeNull();
  expect(bubble).not.toBeNull();
  for (const point of [
    { x: avatar!.x + avatar!.width / 2, y: avatar!.y + avatar!.height - 2 },
    { x: (avatar!.x + avatar!.width + bubble!.x) / 2, y: bubble!.y + 3 },
  ]) {
    await bob.mouse.move(point.x, point.y, { steps: 5 });
    await expect(bar).toBeHidden();
  }
  await bobsRow.getByText(text).hover();
  await expect(bar).toBeVisible();
  await bobsRow.getByRole("button", { name: "React with 👍" }).hover();
  await expect(bar).toBeVisible();
  await bobsRow.getByRole("button", { name: "React with 👍" }).click();

  // The author sees what others added, but cannot react to their own message.
  const alicesRow = alice.getByRole("listitem").filter({ hasText: text });
  await expect(alicesRow.getByRole("img", { name: "👍 1: Bob" })).toBeVisible();
  await expect(
    alicesRow.getByRole("button", { name: /^React with/ }),
  ).toHaveCount(0);
  await expect(
    alicesRow.getByRole("button", { name: "Add reaction" }),
  ).toHaveCount(0);
  await expect(bob.getByRole("button", { name: "👍 1: Bob" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const chip of [
    bobsRow.getByRole("button", { name: "👍 1: Bob" }),
    alicesRow.getByRole("img", { name: "👍 1: Bob" }),
    bobsRow.getByRole("button", { name: "Add reaction" }).last(),
  ]) {
    await expect(chip).toHaveCSS("width", "28px");
    await expect(chip).toHaveCSS("height", "24px");
  }

  // Another emoji from the full set.
  for (const width of [390, 1280]) {
    await bob.setViewportSize({ width, height: 844 });
    await bobsRow.getByText(text).hover();
    await bobsRow.getByRole("button", { name: "Add reaction" }).first().click();
    const picker = bob.getByRole("dialog", { name: "Add reaction" });
    const search = picker.getByRole("searchbox", { name: "Search emoji" });
    await expect(search).toBeVisible();
    await expect(
      picker.getByRole("tab", { name: "GIFs", exact: true }),
    ).toHaveCount(0);
    const bounds = await picker.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await search.fill("dinosaur");
    const dinosaur = picker.getByRole("gridcell").filter({ hasText: "🦖" });
    await expect(dinosaur).toBeVisible();
    if (width === 390) {
      await picker.press("Escape");
    } else {
      await dinosaur.press("Space");
    }
    await expect(picker).toHaveCount(0);
  }
  await expect(alicesRow.getByRole("img", { name: "🦖 1: Bob" })).toBeVisible();

  // The history carries them, so somebody who arrives later sees them too, and can join in.
  await enterRoom(carol, LOUNGE.name, "Carol");
  const carolsRow = carol.getByRole("listitem").filter({ hasText: text });
  await carolsRow.getByRole("button", { name: "👍 1: Bob" }).click();
  await expect(
    alicesRow.getByRole("img", { name: "👍 2: Bob, Carol" }),
  ).toBeVisible();
  const countedChip = alicesRow.getByRole("img", { name: "👍 2: Bob, Carol" });
  await expect(countedChip).toHaveText("👍2");
  expect((await countedChip.boundingBox())!.width).toBeGreaterThan(28);

  // Taking one back removes it for everybody.
  await bob.getByRole("button", { name: "🦖 1: Bob" }).click();
  await expect(alicesRow.getByRole("img", { name: "🦖 1: Bob" })).toHaveCount(
    0,
  );
});
for (const activation of ["click", "Enter", "Space"] as const) {
  test(`an emoji chosen from the picker is added to the message and sent with it (${activation})`, async ({
    browser,
  }) => {
    const alice = await newGuest(browser);
    const bob = await newGuest(browser);
    await enterRoom(alice, LOUNGE.name, "Alice");
    await enterRoom(bob, LOUNGE.name, "Bob");
    const text = `emoji ${Date.now()}`;

    const box = alice.getByRole("textbox", { name: "Message" });
    await fillMessage(box, text);
    await alice
      .getByRole("button", { name: "Add attachments", exact: true })
      .click();
    await alice.getByRole("searchbox", { name: "Search emoji" }).fill("pizza");
    const emoji = alice.getByRole("gridcell").filter({ hasText: "🍕" });
    if (activation === "click") {
      await emoji.click();
    } else {
      await emoji.press(activation);
    }

    // Added to what is being written, not sent.
    await expect(box).toHaveText(`${text}🍕`);
    await expect(bob.getByRole("log")).not.toContainText(`${text}🍕`);

    await send(alice, `${text}🍕 yum`);
    await expect(bob.getByRole("log")).toContainText(`${text}🍕 yum`);
  });
}

test("messages sent while a guest was disconnected appear once they reconnect", async ({
  browser,
}) => {
  const whileAway = `sent while you were away ${Date.now()}`;
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);

  const connections: { close: () => Promise<void> }[] = [];
  await alice.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    connections.push({
      close: async () => {
        await ws.close();
        await server.close();
      },
    });
  });

  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  await expect(
    alice.getByRole("heading", { name: "In this room (2 of 5)" }),
  ).toBeVisible();

  await Promise.all(connections.map((connection) => connection.close()));
  await expect(alice.getByRole("status")).toHaveText(
    "Connection lost. Reconnecting…",
  );

  // Alice's first reconnect attempt waits a second, so this is sent while she is away.
  await send(bob, whileAway);

  await expect(alice.getByRole("status")).toHaveCount(0);
  await expect(alice.getByRole("log")).toContainText(whileAway);
  await expect(alice.getByRole("log").getByText(whileAway)).toHaveCount(1);
});

test("a full room queues guests in order and admits them automatically", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  const carol = await newGuest(browser);

  await enterRoom(alice, TINY.name, "Alice");
  await startJoin(bob, TINY.name, "Bob");
  const bobQueue = bob.getByRole("dialog", { name: `Queue for ${TINY.name}` });
  await expect(bobQueue.getByRole("status")).toContainText("Position 1");
  await startJoin(carol, TINY.name, "Carol");
  const carolQueue = carol.getByRole("dialog", {
    name: `Queue for ${TINY.name}`,
  });
  await expect(carolQueue.getByRole("status")).toContainText("Position 2");

  await expect(
    bobQueue.getByRole("button", { name: "Leave queue" }),
  ).toHaveCount(0);
  await bob.mouse.click(8, 8);
  await expect(bobQueue).toHaveCount(0);
  await expect(carolQueue.getByRole("status")).toContainText("Position 1");
  await bob.getByRole("button", { name: `Join ${TINY.name}` }).click();
  await expect(bobQueue.getByRole("status")).toContainText("Position 2");

  await leaveRoom(alice);
  await expect(carol.getByRole("log", { name: TINY.name })).toBeVisible();
  await expect(carolQueue).toHaveCount(0);
  await expect(bobQueue.getByRole("status")).toContainText("Position 1");
  await leaveRoom(carol);
  await expect(bob.getByRole("log", { name: TINY.name })).toBeVisible();
  await expect(bobQueue).toHaveCount(0);
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 600 },
]) {
  test(`a queued room switch preserves the current room at ${viewport.width}px`, async ({
    browser,
  }) => {
    const alice = await newGuest(browser);
    const bob = await newGuest(browser);
    await bob.setViewportSize(viewport);
    await enterRoom(alice, TINY.name, "Alice");
    await enterRoom(bob, LOUNGE.name, "Bob");
    const words = `Before queuing ${Date.now()}`;
    await send(bob, words);

    async function queueSwitch() {
      await bob.locator("#room-heading").getByRole("button").click();
      await bob.getByRole("menuitem", { name: TINY.name }).click();
      const dialog = bob.getByRole("dialog", {
        name: `Queue for ${TINY.name}`,
      });
      await expect(dialog.getByRole("status")).toContainText("Position 1");
      await expect(bob).toHaveURL(new RegExp(`/rooms/${LOUNGE.slug}$`));
      const panel = await dialog
        .getByRole("status")
        .locator("..")
        .boundingBox();
      await expect(dialog.getByRole("status").locator("..")).toHaveCSS(
        "opacity",
        "1",
      );
      expect(panel).not.toBeNull();
      expect(panel!.x).toBeGreaterThanOrEqual(0);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width);
      expect(panel!.y).toBeGreaterThanOrEqual(0);
      expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height);
      await bob.screenshot({
        path: test.info().outputPath(`queue-${viewport.width}.png`),
        animations: "disabled",
      });
      await expect(bob.locator('[role="log"]')).toContainText(words);
      return dialog;
    }

    const dialog = await queueSwitch();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(bob.getByRole("log", { name: LOUNGE.name })).toBeVisible();
    await queueSwitch();
    await leaveRoom(alice);
    await expect(bob.getByRole("log", { name: TINY.name })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(bob).toHaveURL(new RegExp(`/rooms/${TINY.slug}$`));
  });
}

test("a guest who is banned while chatting is removed and their messages are replaced for everyone", async ({
  browser,
}) => {
  // Browsers share the loopback address, so the banned guest is a raw client with an address of its own.
  const MALLORY_ADDRESS = "203.0.113.60";
  const awful = `something awful ${Date.now()}`;
  const bob = await newGuest(browser);
  const mallory = await connectRawGuest("Mallory", MALLORY_ADDRESS);

  try {
    await enterRoom(bob, LOUNGE.name, "Bob");
    expect(await mallory.join(LOUNGE.slug)).toMatchObject({ ok: true });
    expect(await mallory.send(awful)).toEqual({ ok: true });
    await expect(bob.getByRole("log")).toContainText(awful);

    // The room's history outlives a run, so it may already hold placeholders from earlier ones.
    const placeholder = "This user was banned";
    const before = await bob.getByText(placeholder).count();

    const banIds = await payload.ban([MALLORY_ADDRESS]);

    try {
      // Bob is still in the room and sees the message change on his screen, with no reload.
      await expect(bob.getByText(placeholder)).toHaveCount(before + 1);
      await expect(bob.getByRole("log")).not.toContainText(awful);
      await expect(bob.getByRole("log")).not.toContainText("Mallory");

      // Mallory was still connected, so the server removes her and says why.
      expect(await mallory.kicked).toEqual({ reason: "banned" });

      // A guest who arrives afterwards gets the placeholder from the room's history, never the text.
      const carol = await newGuest(browser);
      await enterRoom(carol, LOUNGE.name, "Carol");
      await expect(carol.getByText(placeholder)).toHaveCount(before + 1);
      await expect(carol.getByRole("log")).not.toContainText(awful);

      // Bob is untouched by a ban on somebody else's address.
      await expect(
        bob.getByRole("heading", { name: LOUNGE.name, level: 2 }),
      ).toBeVisible();
    } finally {
      await Promise.all(banIds.map((id) => payload.remove("bans", id)));
    }
  } finally {
    mallory.close();
  }
});

test("a room with slow mode makes a guest wait between messages", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  await enterRoom(alice, SLOW.name, "Alice");

  await send(alice, "first");
  await expect(alice.getByRole("log")).toContainText("first");

  // Straight away: refused, with the draft kept and the wait explained.
  await send(alice, "too soon");
  await expect(alice.getByRole("alert")).toContainText(
    /You can send again in [1-3] s\./,
  );
  await expect(alice.getByRole("textbox", { name: "Message" })).toHaveText(
    "too soon",
  );
  await expect(alice.getByRole("log")).not.toContainText("too soon");

  // Once the wait is over the same draft goes through.
  await expect(async () => {
    await alice.getByRole("button", { name: "Send", exact: true }).click();
    await expect(alice.getByRole("log")).toContainText("too soon", {
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });
});

test("a banned guest is turned away until the ban is lifted", async ({
  page,
}) => {
  const banIds = await payload.banLoopback();

  try {
    await waitForConnectionState("banned");

    await startJoin(page, LOUNGE.name, "Mallory");
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "You are banned from this chat.",
    );
  } finally {
    await Promise.all(banIds.map((id) => payload.remove("bans", id)));
  }

  await waitForConnectionState("ok");

  // The dialog is still open with the same nickname, so the guest can simply try again.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: LOUNGE.name, level: 2 }),
  ).toBeVisible();
});

test("a guest must explicitly accept the terms on every join and can read them first", async ({
  browser,
}) => {
  const page = await newGuest(browser);
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
  await page.getByRole("textbox", { name: "Nickname" }).fill("Alice");

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText(
      "To continue you need to be 18 or older and accept the terms.",
    ),
  ).toBeVisible();

  // The terms open in a tab of their own, so that what was typed is not lost.
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "terms of use" })
    .click();
  const terms = await opened;
  await expect(
    terms.getByRole("heading", { level: 1, name: "Terms of use" }),
  ).toBeVisible();
  // The page keeps the site's header and shows where it is.
  await expect(terms.getByRole("banner")).toContainText("Chatter");
  await expect(
    terms.getByRole("navigation", { name: "You are here" }),
  ).toBeVisible();
  await terms.getByRole("link", { name: "Privacy policy" }).click();
  await expect(
    terms.getByRole("heading", { level: 1, name: "Privacy policy" }),
  ).toBeVisible();
  await terms.close();

  await acceptTerms(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: LOUNGE.name, level: 2 }),
  ).toBeVisible();

  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
  await expect(
    page.getByRole("checkbox", { name: /18 or older/ }),
  ).not.toBeChecked();
  await page.getByRole("textbox", { name: "Nickname" }).fill("Alice");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText(
      "To continue you need to be 18 or older and accept the terms.",
    ),
  ).toBeVisible();
  await acceptTerms(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: LOUNGE.name, level: 2 }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 700 },
]) {
  test(`an admin simulates the Test lab queue at ${viewport.width}px`, async ({
    browser,
  }) => {
    const unique = String(Date.now());
    const name = `Queue Tester ${unique.slice(-6)}`;
    const email = `${E2E.moderatorEmailPrefix}queue-${unique}@chatter.test`;
    const password = crypto.randomUUID();
    const accountId = await payload.createModerator(
      email,
      password,
      name,
      "super-admin",
    );
    try {
      await waitForReservedNickname(name);
      const page = await newGuest(browser);
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Username or email" })
        .fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const tools = page.getByRole("button", { name: "Admin tools" });
      await tools.click();
      for (const name of ["Add a person", "Add a person", "Fill the room"]) {
        await page.getByRole("menuitem", { name }).click();
        await expect(page.getByRole("menu")).toBeVisible();
      }
      await page
        .getByRole("heading", { name: "Public rooms" })
        .click({ position: { x: 1, y: 1 } });
      await expect(page.getByRole("menu")).toHaveCount(0);
      await tools.click();
      await page
        .getByRole("checkbox", { name: "Queue when rooms are full" })
        .check();
      await page
        .getByRole("spinbutton", { name: "Simulated people ahead (0–1000)" })
        .fill("3");
      const save = page.getByRole("button", { name: "Save simulated queue" });
      await save.click();
      await expect(save).toBeDisabled();
      await page.screenshot({
        path: test.info().outputPath(`admin-queue-tools-${viewport.width}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Join Test lab" }).click();
      const dialog = page.getByRole("dialog", { name: "Queue for Test lab" });
      await expect(dialog.getByRole("status")).toContainText("Position 4");
      await expect(
        dialog.getByRole("button", { name: "Advance queue" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Leave queue" }),
      ).toHaveCount(0);
      await expect(dialog.getByRole("status").locator("..")).toHaveCSS(
        "opacity",
        "1",
      );
      await page.screenshot({
        path: test.info().outputPath(`admin-queue-modal-${viewport.width}.png`),
        animations: "disabled",
      });
      const queueTools = dialog.getByRole("button", { name: "Admin tools" });
      await queueTools.click();
      const advance = dialog.getByRole("menuitem", { name: "Advance queue" });
      await advance.click();
      await expect(dialog.getByRole("status")).toContainText("Position 3");
      await expect(dialog.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog.getByRole("menu")).toHaveCount(0);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: "Join Test lab" }).click();
      await expect(dialog.getByRole("status")).toContainText("Position 4");
      await queueTools.click();
      for (const position of [3, 2, 1]) {
        await advance.click();
        await expect(dialog.getByRole("status")).toContainText(
          `Position ${position}`,
        );
      }
      await advance.click();
      await expect(page.getByRole("log", { name: "Test lab" })).toBeVisible();
      await expect(dialog).toHaveCount(0);
      await tools.click();
      await page
        .getByRole("checkbox", { name: "Queue when rooms are full" })
        .uncheck();
      await page.keyboard.press("Escape");
      await tools.click();
      await page.getByRole("menuitem", { name: "Fill the room" }).click();
      await leaveRoom(page);
      await page.getByRole("button", { name: "Join Test lab" }).click();
      await expect(page.getByRole("log", { name: "Test lab" })).toBeVisible();
      await expect(dialog).toHaveCount(0);
    } finally {
      await payload.remove("admins", accountId);
    }
  });
}

test("the Test lab crowd previews private and room typing counts", async ({
  browser,
}, testInfo) => {
  test.setTimeout(75_000);
  const unique = String(Date.now());
  const name = `Typing Tester ${unique.slice(-6)}`;
  const email = `${E2E.moderatorEmailPrefix}typing-${unique}@chatter.test`;
  const password = crypto.randomUUID();
  const accountId = await payload.createModerator(
    email,
    password,
    name,
    "super-admin",
  );
  try {
    await waitForReservedNickname(name);
    const page = await newGuest(browser);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("textbox", { name: "Username or email" }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Join Test lab" }).click();
    await expect(page.getByRole("log", { name: "Test lab" })).toBeVisible();
    const tools = page.getByRole("button", { name: "Admin tools" });
    await tools.click();
    await page.getByRole("spinbutton", { name: "Room limit" }).fill("20");
    await page.getByRole("button", { name: "Save room limit" }).click();
    await page
      .getByRole("menuitem", { name: "Fill the room", exact: true })
      .click();
    const preview = page.getByRole("button", {
      name: "Simulate typing",
      exact: true,
    });
    await expect(preview).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Stop simulated typing" }),
    ).toHaveCount(0);
    await preview.click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("status", { name: "Typing activity" }),
    ).toHaveText(/^.+ and 3 others are typing$/);
    await tools.click();
    await page
      .getByRole("menuitem", { name: "Remove everybody", exact: true })
      .click();
    await expect(preview).toBeDisabled();
    await page
      .getByRole("textbox", { name: "Number of people (1–20)" })
      .fill("19");
    await page.getByRole("button", { name: "Start the crowd" }).click();
    await expect(page.getByRole("menu")).toContainText("19 of 19", {
      timeout: 15_000,
    });
    await page.getByRole("menuitem", { name: "Pause", exact: true }).click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      if ((await tools.getAttribute("aria-expanded")) !== "true")
        await tools.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.getByRole("spinbutton", { name: "Typing to you" }).fill("7");
      await page
        .getByRole("spinbutton", { name: "Typing to the room" })
        .fill("12");
      await page
        .getByRole("button", { name: "Simulate typing", exact: true })
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`crowd-typing-controls-${width}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      const activity = page.getByRole("status", { name: "Typing activity" });
      await expect(activity).toHaveText(/and 12 others are typing$/);
      await expect(activity).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`crowd-typing-${width}.png`),
        animations: "disabled",
      });
      await tools.click();
      await page.getByRole("spinbutton", { name: "Typing to you" }).fill("0");
      await page
        .getByRole("spinbutton", { name: "Typing to the room" })
        .fill("3");
      await page
        .getByRole("button", { name: "Simulate typing", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await expect(activity).toHaveText(/are typing$/);
      await expect(activity).not.toContainText("others");
      const stableNames = await activity.innerText();
      const changes = await activity.evaluate(async (element) => {
        let changed = false;
        const initial = element.textContent;
        const observer = new MutationObserver(() => {
          if (element.textContent !== initial) changed = true;
        });
        observer.observe(element, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 3200));
        observer.disconnect();
        return changed;
      });
      expect(changes).toBe(false);
      await expect(activity).toHaveText(stableNames);
      await tools.click();
    }
    await page.getByRole("spinbutton", { name: "Typing to you" }).fill("7");
    await page
      .getByRole("spinbutton", { name: "Typing to the room" })
      .fill("12");
    await page
      .getByRole("button", { name: "Simulate typing", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("status", { name: "Typing activity" }),
    ).toHaveText(/and 12 others are typing$/);
    await expect(page.locator("[data-typing-indicator]:visible")).toBeEmpty({
      timeout: 20_000,
    });
    await tools.click();
    await expect(
      page.getByRole("button", { name: "Stop simulated typing" }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", { name: "Stop and send them away" })
      .click();
  } finally {
    await payload.remove("admins", accountId);
  }
});

test(
  "a moderator signs in, and guests see their messages stand out",
  { tag: "@smoke" },
  async ({ browser }) => {
    // Room history outlives a run, so a name and words reused by an earlier run would match twice.
    const unique = String(Date.now()).slice(-6);
    const name = `E2E Mod ${unique}`;
    const words = `Please keep it friendly ${unique}`;
    const email = `${E2E.moderatorEmailPrefix}${Date.now()}@chatter.test`;
    const password = crypto.randomUUID();
    const accountId = await payload.createModerator(email, password, name);

    try {
      await waitForReservedNickname(name);

      const alice = await newGuest(browser);
      await enterRoom(alice, LOUNGE.name, "Alice");

      const moderator = await newGuest(browser);
      await moderator.goto("/");
      await moderator
        .getByRole("button", { name: "Sign in", exact: true })
        .click();

      // A wrong password is explained and nothing is joined.
      await moderator
        .getByRole("textbox", { name: "Username or email" })
        .fill(email);
      await moderator
        .getByLabel("Password", { exact: true })
        .fill("not the password");
      await moderator.getByRole("button", { name: "Sign in" }).click();
      await expect(moderator.getByRole("dialog").getByRole("alert")).toHaveText(
        "Wrong username, email or password.",
      );

      await moderator.getByLabel("Password", { exact: true }).fill(password);
      await moderator.getByRole("button", { name: "Sign in" }).click();
      // Signing in leaves the moderator in the lobby; the room is joined from there.
      await moderator
        .getByRole("button", { name: `Join ${LOUNGE.name}` })
        .click();
      await expect(
        moderator.getByRole("button", { name: `Account menu: ${name}` }),
      ).toBeVisible();

      await send(moderator, words);

      const message = alice.getByRole("log").getByText(words);
      await expect(message).toBeVisible();
      await expect(message).toHaveClass(/font-bold/);
      await expect(
        alice
          .getByRole("log")
          .getByText(name, { exact: true })
          .locator("../.."),
      ).toHaveClass(/text-green-400/);
      await expect(
        alice
          .getByRole("log")
          .getByRole("listitem")
          .filter({ hasText: words })
          .getByText("Moderator"),
      ).toBeVisible();
      await expect(
        alice.getByRole("complementary").getByText(name).locator("../.."),
      ).toHaveClass(/text-green-400/);
    } finally {
      await payload.remove("admins", accountId);
    }
  },
);

test("a guest cannot take a name that sounds like staff", async ({ page }) => {
  await startJoin(page, LOUNGE.name, "Admin");

  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "That nickname is reserved. Pick another one.",
  );
});

test("a moderator's announcement reaches everyone, including guests who arrive later", async ({
  browser,
}) => {
  const unique = String(Date.now()).slice(-6);
  const name = `E2E Mod ${unique}`;
  const words = `Maintenance at noon ${unique}`;
  const email = `${E2E.moderatorEmailPrefix}${unique}@chatter.test`;
  const password = crypto.randomUUID();
  const accountId = await payload.createModerator(email, password, name);
  const announcementOn = (page: Page) =>
    page.getByRole("region", { name: "Announcement" });

  try {
    const alice = await newGuest(browser);
    await enterRoom(alice, LOUNGE.name, "Alice");
    await expect(
      alice.getByRole("button", { name: "Choose how to send" }),
    ).toHaveCount(0);

    const moderator = await newGuest(browser);
    await moderator.goto("/");
    await moderator
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await moderator
      .getByRole("textbox", { name: "Username or email" })
      .fill(email);
    await moderator.getByLabel("Password", { exact: true }).fill(password);
    await moderator.getByRole("button", { name: "Sign in" }).click();
    // Signing in leaves the moderator in the lobby; the room is joined from there.
    await moderator
      .getByRole("button", { name: `Join ${LOUNGE.name}` })
      .click();
    await expect(
      moderator.getByRole("button", { name: `Account menu: ${name}` }),
    ).toBeVisible();

    // The send button's menu turns the box into an announcement's, and goes back to a message once it is sent.
    for (const width of [390, 1280]) {
      await moderator.setViewportSize({ width, height: 844 });
      await expectPickerAligned(moderator);
      for (const draft of ["", "First line\nSecond line\nThird line"]) {
        const messageBox = moderator.getByRole("textbox", {
          name: "Message",
          exact: true,
        });
        await messageBox.press("ControlOrMeta+A");
        await messageBox.press("Backspace");
        await fillMessage(messageBox, draft);
        await moderator
          .getByRole("button", { name: "Choose how to send" })
          .click();
        const sendMenu = moderator.getByRole("menu");
        await expect(sendMenu).toBeVisible();
        await expect
          .poll(async () => {
            const menuBounds = await sendMenu.boundingBox();
            const composerBounds = await moderator
              .locator("form[data-composer]")
              .boundingBox();
            return Math.abs(
              composerBounds!.y - menuBounds!.y - menuBounds!.height - 8,
            );
          })
          .toBeLessThan(1);
        const sendBounds = await sendMenu.boundingBox();
        const headerBounds = await moderator.locator("header").boundingBox();
        expect(sendBounds!.y).toBeGreaterThanOrEqual(
          headerBounds!.y + headerBounds!.height + 8 - 1,
        );
        expect(sendBounds!.x).toBeGreaterThanOrEqual(16);
        expect(sendBounds!.x + sendBounds!.width).toBeLessThanOrEqual(
          width - 16,
        );
        await sendMenu.press("Escape");
      }
    }
    const messageBox = moderator.getByRole("textbox", {
      name: "Message",
      exact: true,
    });
    await messageBox.press("ControlOrMeta+A");
    await messageBox.press("Backspace");
    const startAnnouncing = async () => {
      await moderator
        .getByRole("button", { name: "Choose how to send" })
        .click();
      await moderator
        .getByRole("menuitem", { name: "Send as an announcement" })
        .click();
    };
    await startAnnouncing();
    await fillMessage(
      moderator.getByRole("textbox", { name: "Announce to everyone" }),
      words,
    );
    await moderator.getByRole("button", { name: "Announce" }).click();

    await expect(moderator.getByRole("log")).toContainText(words);
    await expect(moderator.getByRole("log")).toContainText(
      `Announcement from ${name}`,
    );
    await moderator.getByRole("button", { name: "Dismiss" }).click();
    await expect(announcementOn(moderator)).toHaveCount(0);
    await expect(
      moderator.getByRole("log").getByText(words, { exact: true }),
    ).toHaveCount(1);

    await expect(announcementOn(alice)).toContainText(words);
    await expect(announcementOn(alice)).toContainText(
      `Announcement from ${name}`,
    );

    // Somebody who arrives afterwards is shown it too.
    const bob = await newGuest(browser);
    await enterRoom(bob, LOUNGE.name, "Bob");
    await expect(announcementOn(bob)).toContainText(words);

    // A second one straight away is refused, and the words are kept for later.
    await startAnnouncing();
    await fillMessage(
      moderator.getByRole("textbox", { name: "Announce to everyone" }),
      "Too soon",
    );
    await moderator.getByRole("button", { name: "Announce" }).click();
    await expect(moderator.getByRole("alert")).toContainText(
      /You can announce again in \d+ s\./,
    );
    await expect(
      moderator.getByRole("textbox", { name: "Announce to everyone" }),
    ).toHaveText("Too soon");
    await expect(announcementOn(alice)).not.toContainText("Too soon");

    await alice.getByRole("button", { name: "Dismiss" }).click();
    await expect(announcementOn(alice)).toHaveCount(0);
    await expect(announcementOn(bob)).toBeVisible();
  } finally {
    await payload.remove("admins", accountId);
  }
});

// Who reports from somebody's message actions.
async function reportFrom(
  page: Page,
  author: string,
  words: string,
  reason: string,
) {
  const row = page
    .getByRole("log")
    .getByRole("listitem")
    .filter({ hasText: words });
  const message = row.locator("[data-nav-id]").filter({ hasText: words });
  const messageId = await message.getAttribute("data-nav-id");
  expect(messageId).toBeTruthy();
  await message.press("Shift+F10");
  await expect(
    row.getByRole("button", { name: `Actions for ${author}` }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("menuitem", { name: "Report message" }).click();
  const dialog = page.getByRole("dialog", { name: "Report this message" });
  await dialog.getByRole("radio", { name: reason }).check();
  await dialog.getByRole("button", { name: "Report" }).click();
  await expect(dialog).toHaveCount(0);
  return messageId;
}

test("a guest reports a message: it is hidden for them, and the admin keeps it to be judged", async ({
  browser,
}) => {
  const words = `Buy my stuff ${Date.now()}`;
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  await send(alice, words);
  await expect(bob.getByRole("log").getByText(words)).toBeVisible();

  const messageId = await reportFrom(bob, "Alice", words, "Spam");

  // One report is not enough to hide it for the others, but the reporter does not see it again.
  await expect(bob.getByRole("log").getByText(words)).toHaveCount(0);
  await expect(
    bob
      .getByRole("log")
      .locator(`[data-nav-id="${messageId}"]`)
      .getByText("Message hidden after being reported"),
  ).toBeVisible();
  await expect(alice.getByRole("log").getByText(words)).toBeVisible();

  await expect
    .poll(async () => (await payload.findReports(words)).length)
    .toBe(1);
  const [report] = await payload.findReports(words);
  expect(report).toMatchObject({
    status: "open",
    nickname: "Alice",
    reporterCount: 1,
    reasons: ["spam"],
  });
  expect(report.senderHash).toMatch(/^[0-9a-f]{64}$/);
  await payload.remove("reports", report.id);
});

test("a moderator's report hides a message for everybody at once", async ({
  browser,
}) => {
  const unique = String(Date.now()).slice(-6);
  const name = `E2E Mod ${unique}`;
  const words = `Something nasty ${unique}`;
  const email = `${E2E.moderatorEmailPrefix}${unique}@chatter.test`;
  const password = crypto.randomUUID();
  const accountId = await payload.createModerator(email, password, name);

  try {
    const alice = await newGuest(browser);
    const bob = await newGuest(browser);
    await enterRoom(alice, LOUNGE.name, "Alice");
    await enterRoom(bob, LOUNGE.name, "Bob");

    const moderator = await newGuest(browser);
    await moderator.goto("/");
    await moderator
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await moderator
      .getByRole("textbox", { name: "Username or email" })
      .fill(email);
    await moderator.getByLabel("Password", { exact: true }).fill(password);
    await moderator.getByRole("button", { name: "Sign in" }).click();
    // Signing in leaves the moderator in the lobby; the room is joined from there.
    await moderator
      .getByRole("button", { name: `Join ${LOUNGE.name}` })
      .click();
    await expect(
      moderator.getByRole("button", { name: `Account menu: ${name}` }),
    ).toBeVisible();

    await send(alice, words);
    await expect(moderator.getByRole("log").getByText(words)).toBeVisible();

    const messageId = await reportFrom(
      moderator,
      "Alice",
      words,
      "Harassment or hate",
    );

    for (const page of [alice, bob, moderator]) {
      await expect(page.getByRole("log").getByText(words)).toHaveCount(0);
      await expect(
        page
          .getByRole("log")
          .locator(`[data-nav-id="${messageId}"]`)
          .getByText("Message hidden after being reported"),
      ).toBeVisible();
    }

    // A guest who joins afterwards is not shown it either.
    const carol = await newGuest(browser);
    await enterRoom(carol, LOUNGE.name, "Carol");
    await expect(carol.getByRole("log").getByText(words)).toHaveCount(0);
    await expect(
      carol
        .getByRole("log")
        .locator(`[data-nav-id="${messageId}"]`)
        .getByText("Message hidden after being reported"),
    ).toBeVisible();

    await expect
      .poll(async () => (await payload.findReports(words)).length)
      .toBe(1);
    const [report] = await payload.findReports(words);
    expect(report).toMatchObject({ status: "hidden", reasons: ["harassment"] });
    await payload.remove("reports", report.id);
  } finally {
    await payload.remove("admins", accountId);
  }
});

test("a moderator whose account is removed is signed out", async ({
  browser,
}) => {
  const unique = String(Date.now()).slice(-6);
  const email = `${E2E.moderatorEmailPrefix}${unique}@chatter.test`;
  const password = crypto.randomUUID();
  const accountId = await payload.createModerator(
    email,
    password,
    `E2E Mod ${unique}`,
  );
  let removed = false;

  try {
    const moderator = await newGuest(browser);
    const guest = await newGuest(browser);
    const browserErrors: string[] = [];
    for (const page of [moderator, guest]) {
      page.on("pageerror", (error) => browserErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
    }
    await enterRoom(guest, LOUNGE.name, `Guest ${unique}`);
    await moderator.goto("/");
    await moderator
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await moderator
      .getByRole("textbox", { name: "Username or email" })
      .fill(email);
    await moderator.getByLabel("Password", { exact: true }).fill(password);
    await moderator.getByRole("button", { name: "Sign in" }).click();
    // Signing in leaves the moderator in the lobby; the room is joined from there.
    await moderator
      .getByRole("button", { name: `Join ${LOUNGE.name}` })
      .click();
    await expect(
      moderator.getByRole("heading", { name: LOUNGE.name, level: 2 }),
    ).toBeVisible();

    await payload.remove("admins", accountId);
    removed = true;

    // The chat server notices on its next sync.
    await expect(moderator.getByRole("alert")).toHaveText(
      "Your session has expired. Sign in again.",
    );
    await expect(
      moderator.getByRole("heading", { name: "Public rooms" }),
    ).toBeVisible();
    await expect(
      guest.getByRole("heading", { name: LOUNGE.name, level: 2 }),
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    if (!removed) await payload.remove("admins", accountId);
  }
});

test(
  "two guests write to each other privately, and a blocked guest is not heard",
  { tag: "@smoke" },
  async ({ browser }) => {
    const room = await isolatedRoom("E2E Private");
    const alice = await newGuest(browser);
    const bob = await newGuest(browser);
    await enterRoom(alice, room.name, "Alice");
    await enterRoom(bob, room.name, "Bob");

    const people = (page: Page) =>
      page.getByRole("list", { name: "People in this room" });
    const conversations = (page: Page) =>
      page.getByRole("list", { name: "Direct messages" });
    const conversation = (page: Page, name: string) =>
      page.getByRole("log", { name: `Direct message with ${name}` });

    // Alice finds Bob in the room and writes to him; the room itself hears nothing.
    await expect(
      people(alice).getByRole("button", { name: /^Bob/ }),
    ).toBeVisible();
    await people(alice)
      .getByRole("button", { name: "Open private chat with Bob" })
      .click();
    await send(alice, "psst, Bob", "Bob");
    await expect(conversation(alice, "Bob")).toContainText("psst, Bob");

    // Bob is told there is something new. The room's log shows it too, marked as private (and nobody else's does).
    const fromAlice = conversations(bob).getByRole("button", {
      name: /^Alice/,
    });
    await expect(fromAlice).toHaveAccessibleName(/1 unread message/);
    await expect(fromAlice.locator("..")).toHaveClass(/animate-pulse/);
    await expect(bob.getByRole("log", { name: room.name })).toContainText(
      "Direct message from Alice",
    );

    await fromAlice.click();
    await expect(conversation(bob, "Alice")).toContainText("psst, Bob");
    await expect(fromAlice).not.toHaveAccessibleName(/unread/);
    await send(bob, "hi Alice", "Alice");
    await expect(conversation(alice, "Bob")).toContainText("hi Alice");

    // Bob has had enough. Alice is told, and can no longer write to him.
    await bob.getByRole("button", { name: "Block Alice" }).click();
    await expect(
      bob.getByRole("button", { name: "Unblock Alice" }).first(),
    ).toBeVisible();
    await expect(conversation(alice, "Bob")).toContainText(
      "Bob has blocked you",
    );
    await expect(
      alice.getByRole("textbox", { name: "Message to Bob" }),
    ).toBeDisabled();
    await expect(conversation(bob, "Alice")).not.toContainText(
      "Bob has blocked you",
    );
  },
);

test(
  "reloading the page, or opening its address, brings a guest back to their room",
  { tag: "@smoke" },
  async ({ browser }) => {
    const alice = await newGuest(browser);
    await enterRoom(alice, LOUNGE.name, "Alice");
    await expect(alice).toHaveURL(new RegExp(`/rooms/${LOUNGE.slug}$`));
    await send(alice, "before the reload");
    await expect(alice.getByRole("log")).toContainText("before the reload");

    await alice.reload();

    await expect(
      alice.getByRole("heading", { name: LOUNGE.name, level: 2 }),
    ).toBeVisible();
    await expect(
      alice.getByRole("button", { name: "Account menu: Alice" }),
    ).toBeVisible();
    // It is a new connection, but what she wrote before is still hers: on her side.
    await expect(
      alice.getByText("before the reload").locator("xpath=ancestor::li"),
    ).toHaveAttribute("data-side", "right");

    // The browser's back button leaves the room, and forward goes in again.
    await alice.goBack();
    await expect(
      alice.getByRole("heading", { name: "Public rooms" }),
    ).toBeVisible();
    await alice.goForward();
    await expect(
      alice.getByRole("button", { name: "Account menu: Alice" }),
    ).toBeVisible();

    // Somebody who opens the address with nothing saved is asked who they are.
    const bob = await newGuest(browser);
    await bob.goto(`/rooms/${LOUNGE.slug}`);
    await expect(bob.getByRole("textbox", { name: "Nickname" })).toBeVisible();
  },
);

test("a guest's chosen avatar is shown to others, and a conversation says when the other person goes offline and returns", async ({
  browser,
}) => {
  const room = await isolatedRoom("E2E Avatar");
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(bob, room.name, "Bea");
  // The avatar is chosen in the profile once in the room, not when joining.
  await bob.getByRole("button", { name: "Account menu: Bea" }).click();
  await bob.getByRole("menuitem", { name: "Your profile" }).click();
  const profile = bob.getByRole("dialog", { name: "Your profile" });
  await profile.getByRole("button", { name: "Edit profile" }).click();
  const female = profile.getByRole("radio", { name: "Female" });
  await female.locator("..").click();
  await expect(female).toBeChecked();
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(
    profile.getByRole("button", { name: "Edit profile" }),
  ).toBeVisible();
  await bob.keyboard.press("Escape");
  await expect(profile).toHaveCount(0);
  await enterRoom(alice, room.name, "Alice");

  // Her avatar is next to what she says, and in the list of people.
  await send(bob, "hello from Bea");
  const line = alice
    .getByRole("log", { name: room.name })
    .getByRole("listitem");
  await expect(
    line.filter({ hasText: "hello from Bea" }).getByTitle("Female"),
  ).toBeVisible();
  await expect(
    alice
      .getByRole("list", { name: "People in this room" })
      .getByRole("button", { name: /^Bea/ })
      .getByTitle("Female"),
  ).toBeVisible();

  // A private conversation: Alice's words are on her right, Bea's on her left.
  await alice
    .getByRole("list", { name: "People in this room" })
    .getByRole("button", { name: "Open private chat with Bea" })
    .click();
  await send(alice, "hi Bea", "Bea");
  const conversation = alice.getByRole("log", {
    name: "Direct message with Bea",
  });
  await expect(
    conversation.getByText("hi Bea").locator("xpath=ancestor::li"),
  ).toHaveAttribute("data-side", "right");

  await leaveRoom(bob);
  await expect(conversation.getByText("Bea went offline.")).toHaveCount(0);
  await bob.getByRole("button", { name: `Join ${room.name}` }).click();
  await expect(bob.getByRole("log", { name: room.name })).toBeVisible();
  await bob.goto("about:blank");
  await expect(conversation.getByText("Bea went offline.")).toBeVisible();
  await bob.goto(`/rooms/${room.slug}`);
  await expect(conversation.getByText("Bea is back online.")).toBeVisible();
});

test("a private message can be reacted to, and the sender sees it", async ({
  browser,
}) => {
  const room = await isolatedRoom("E2E Private Reactions");
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, room.name, "Alice");
  await enterRoom(bob, room.name, "Bob");
  await alice
    .getByRole("list", { name: "People in this room" })
    .getByRole("button", { name: "Open private chat with Bob" })
    .click();
  await send(alice, "a secret", "Bob");

  const line = bob
    .getByRole("log", { name: room.name })
    .getByRole("listitem")
    .filter({ hasText: "a secret" });
  await line.locator("[data-nav-id]").press("ArrowRight");
  const heart = line.getByRole("button", { name: "React with ❤️" });
  await expect(heart).toBeVisible();
  await heart.press("Enter");

  await expect(line.getByRole("button", { name: /^❤️ 1/ })).toBeVisible();
  await expect(
    alice
      .getByRole("log", { name: "Direct message with Bob" })
      .getByRole("img", { name: "❤️ 1: Bob" }),
  ).toBeVisible();
});

test("a private conversation carries on when one of the two reloads the page", async ({
  browser,
}) => {
  const room = await isolatedRoom("E2E Private Reload");
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, room.name, "Alice");
  await enterRoom(bob, room.name, "Bob");

  const people = (page: Page) =>
    page.getByRole("list", { name: "People in this room" });
  const conversation = (page: Page, name: string) =>
    page.getByRole("log", { name: `Direct message with ${name}` });

  await people(alice)
    .getByRole("button", { name: "Open private chat with Bob" })
    .click();
  await send(alice, "before the reload", "Bob");
  await bob
    .getByRole("list", { name: "Direct messages" })
    .getByRole("button", { name: /^Alice/ })
    .click();
  await expect(conversation(bob, "Alice")).toContainText("before the reload");

  await bob.reload();

  // Bob is the same person in the same room, and is back in the conversation he had open.
  await expect(
    bob.getByRole("button", { name: "Account menu: Bob" }),
  ).toBeVisible();
  await expect(conversation(bob, "Alice")).toContainText("before the reload");

  await expect(
    conversation(bob, "Alice").getByText("before the reload", { exact: true }),
  ).toHaveCount(1);
  await expect(
    conversation(alice, "Bob").getByText("before the reload", { exact: true }),
  ).toHaveCount(1);
  await send(alice, "after the reload", "Bob");
  await expect(alice.getByRole("alert")).toHaveCount(0);
  await expect(conversation(bob, "Alice")).toContainText("after the reload");

  await send(bob, "welcome back to me", "Alice");
  await expect(conversation(alice, "Bob")).toContainText("welcome back to me");
});

test("a reload restores a conversation outside the room but closes it when the other person is offline", async ({
  browser,
}) => {
  const room = await isolatedRoom("E2E Private Offline");
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, room.name, "Alice");
  await enterRoom(bob, room.name, "Bob");

  await alice
    .getByRole("list", { name: "People in this room" })
    .getByRole("button", { name: "Open private chat with Bob" })
    .click();
  await send(alice, "hello Bob", "Bob");
  await bob
    .getByRole("list", { name: "Direct messages" })
    .getByRole("button", { name: /^Alice/ })
    .click();
  await expect(
    bob.getByRole("log", { name: "Direct message with Alice" }),
  ).toContainText("hello Bob");

  await leaveRoom(alice);
  await bob.reload();
  await expect(
    bob.getByRole("log", { name: "Direct message with Alice" }),
  ).toContainText("hello Bob");
  await alice.goto("about:blank");
  await expect(
    bob
      .getByRole("log", { name: "Direct message with Alice" })
      .getByText("Alice went offline."),
  ).toBeVisible();
  await bob.reload();

  // The room is shown, not the conversation, which is still in the list.
  await expect(bob.getByRole("log", { name: room.name })).toBeVisible();
  await expect(
    bob
      .getByRole("list", { name: "Direct messages" })
      .getByRole("button", { name: /^Alice/ }),
  ).toBeVisible();
});

test("the room only says who comes and goes when a guest switches that on", async ({
  browser,
}) => {
  test.setTimeout(45_000);
  const fixture = await isolatedRoom("E2E Movements");
  const alice = await newGuest(browser);
  await enterRoom(alice, fixture.name, "Alice");
  const room = alice.getByRole("log", { name: fixture.name });
  const openSetting = async () => {
    if (!(await alice.getByRole("dialog", { name: "Settings" }).isVisible())) {
      const trigger = alice.getByRole("button", {
        name: /^(Menu|Account menu:)/,
      });
      if ((await trigger.getAttribute("aria-expanded")) !== "true")
        await trigger.click();
      await alice.getByRole("menuitem", { name: "Settings" }).click();
    }
    return alice.getByRole("checkbox", {
      name: "Show a message in the chat when someone joins or leaves the room.",
    });
  };
  await expect(await openSetting()).toHaveAttribute("aria-checked", "false");
  await alice.keyboard.press("Escape");

  const bob = await newGuest(browser);
  await enterRoom(bob, fixture.name, "Bob");
  await expect(room).not.toContainText("Bob joined the room.");
  const toggle = await openSetting();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(alice.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await alice.keyboard.press("Escape");
  await expect(room).toContainText("Bob joined the room.");

  await leaveRoom(bob);
  // Departures are announced only after the grace period, in case the guest comes straight back.
  await expect(room).toContainText("Bob left the room.", { timeout: 25_000 });

  await (await openSetting()).click();
  await alice.keyboard.press("Escape");
  await expect(alice.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  await expect(alice).not.toHaveURL(/dialog=settings/);
  await expect(room).not.toContainText("Bob left the room.");

  // The choice belongs to the browser, so a reload keeps it.
  await alice.reload();
  await expect(
    alice.getByRole("button", { name: "Account menu: Alice" }),
  ).toBeVisible();
  await expect(await openSetting()).toHaveAttribute("aria-checked", "false");
});

test("two guests can share a public name while keeping separate identities", async ({
  browser,
}) => {
  const room = await isolatedRoom("E2E Shared Names");
  const alice = await newGuest(browser);
  const other = await newGuest(browser);
  await enterRoom(alice, room.name, "Alice");
  await enterRoom(other, room.name, "Alice");
  await send(alice, "From the first Alice");
  await send(other, "From the second Alice");
  for (const [page, own, incoming] of [
    [alice, "From the first Alice", "From the second Alice"],
    [other, "From the second Alice", "From the first Alice"],
  ] as const) {
    const log = page.getByRole("log", { name: room.name });
    await expect(
      log.getByText(own).locator("xpath=ancestor::li"),
    ).toHaveAttribute("data-side", "right");
    await expect(
      log.getByText(incoming).locator("xpath=ancestor::li"),
    ).toHaveAttribute("data-side", "left");
  }
});
