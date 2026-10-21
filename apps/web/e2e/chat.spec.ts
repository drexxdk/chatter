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

const LOUNGE = {
  name: "E2E Lounge",
  slug: `${E2E.slugPrefix}lounge`,
  maxMembers: 5,
};
const TINY = { name: "E2E Tiny", slug: `${E2E.slugPrefix}tiny`, maxMembers: 1 };
const SLOW = {
  name: "E2E Slow",
  slug: `${E2E.slugPrefix}slow`,
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
  const context = await browser.newContext({ locale: "en-US" });
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
  await page.getByRole("button", { name: "Continue" }).click();
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
      await guest.getByRole("button", { name: "Continue" }).click();
      await expect(
        guest.getByRole("heading", { name: LOUNGE.name, level: 2 }),
      ).toBeVisible();
      await expect(guest.getByRole("dialog")).toHaveCount(0);
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

test("private-message sounds are opt-in with adjustable volume", async ({
  browser,
}, testInfo) => {
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
    await recipient
      .getByRole("menuitem", { name: /Notification sounds/ })
      .click();
    return recipient.getByRole("dialog", {
      name: "Notification sounds",
      exact: true,
    });
  };
  const dialog = await openSettings();
  const enabled = dialog.getByRole("checkbox", {
    name: "Private message sounds",
  });
  const volume = dialog.getByRole("slider", { name: "Volume" });
  await expect(enabled).not.toBeChecked();
  await expect(volume).toBeDisabled();
  await enabled.check();
  await volume.focus();
  await volume.press("Home");
  for (let step = 0; step < 25; step += 1) await volume.press("ArrowRight");
  await expect(volume).toHaveValue("25");
  await dialog.getByRole("button", { name: "Preview sound" }).click();
  await expect.poll(async () => (await audio()).notes).toBe(2);
  expect((await audio()).levels).toEqual([0.04, 0.04]);

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
  ).toBeDisabled();
  await dialog.press("Escape");
  await send(sender, "Muted private message", "Sound Recipient");
  await expect(
    recipient
      .getByRole("log")
      .getByText("Muted private message", { exact: true }),
  ).toBeVisible();
  expect((await audio()).notes).toBe(4);
});

test("the people dropdown focuses search and stays scrollable when resized", async ({
  browser,
}) => {
  const guest = await newGuest(browser);
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

  await search.press("Escape");
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
  await expect(search).toBeFocused();
  const message = guest.getByRole("textbox", { name: "Message", exact: true });
  await message.click();
  await expect(panel).toHaveCount(0);
  await expect(message).toBeFocused();

  await toggle.click();
  await expect(search).toBeFocused();
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
  await picker
    .getByLabel("YouTube link", { exact: true })
    .fill("https://youtu.be/aqz-KE-bpKQ");
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
          Array.from(
            { length: 35 },
            (_, index) => `Key line ${index + 1}`,
          ).join("\n"),
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
      guest.getByRole("log").getByText("Key line 35", { exact: false }),
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
    await expect.poll(distanceFromBottom).toBeLessThan(2);
    await guest.getByRole("textbox", { name: "Message", exact: true }).focus();
    for (const height of [480, 844, 480, 844]) {
      await guest.setViewportSize({ width: 390, height });
      await expect.poll(distanceFromBottom).toBeLessThan(2);
    }
    await guest.evaluate(() => window.scrollTo(0, 100));
    await expect.poll(() => guest.evaluate(() => window.scrollY)).toBe(100);
    expect(await distanceFromBottom()).toBeGreaterThan(120);
    for (const height of [480, 844]) {
      await guest.setViewportSize({ width: 390, height });
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
  await guest.getByRole("button", { name: "Continue" }).click();
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
    const headerBounds = (await header.boundingBox())!;
    expect(inputBounds!.width).toBeGreaterThanOrEqual(72);
    expect(inputBounds!.y).toBeGreaterThanOrEqual(headerBounds.y);
    expect(inputBounds!.y + inputBounds!.height).toBeLessThanOrEqual(
      headerBounds.y + headerBounds.height,
    );
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
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

test("messages align with the composer without a divider", async ({
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
        (element) => getComputedStyle(element, "::before").content,
      ),
    ).toBe("none");
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

test("two guests chat in real time and see each other come and go", async ({
  browser,
}) => {
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
});

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

  await connections[0].close();

  await expect(alice.getByRole("status")).toHaveText(
    "Connection lost. Reconnecting…",
  );
  // Back in the same room, with the history that was on screen still there.
  await expect(alice.getByRole("status")).toHaveCount(0);
  await expect(
    alice.getByRole("heading", { name: LOUNGE.name, level: 2 }),
  ).toBeVisible();
  await expect(alice.getByRole("log")).toContainText("before the drop");
  expect(connections).toHaveLength(2);

  // Bob sees Alice leave and come back as a member, and they can talk again in both directions.
  await expect(
    bob.getByRole("heading", { name: "In this room (2 of 5)" }),
  ).toBeVisible();
  await send(bob, "welcome back");
  await expect(alice.getByRole("log")).toContainText("welcome back");
  await send(alice, "I'm back");
  await expect(bob.getByRole("log")).toContainText("I'm back");
});

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

  await connections[0].close();
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
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: LOUNGE.name, level: 2 }),
  ).toBeVisible();
});

test("a guest has to say they are 18 or older and accept the terms, which can be read, and is only asked once", async ({
  browser,
}) => {
  const page = await newGuest(browser);
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
  await page.getByRole("textbox", { name: "Nickname" }).fill("Alice");

  await page.getByRole("button", { name: "Continue" }).click();
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
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: LOUNGE.name, level: 2 }),
  ).toBeVisible();

  // The browser remembers it: the next time the box is already ticked. (The tab's own session is cleared, as in a new
  // tab, or the lobby would simply put the guest back in the room.)
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
  await expect(
    page.getByRole("checkbox", { name: /18 or older/ }),
  ).toBeChecked();
  await page.getByRole("textbox", { name: "Nickname" }).fill("Alice");
  await page.getByRole("button", { name: "Continue" }).click();
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
      await page.getByLabel("Password").fill(password);
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

test("a moderator signs in, and guests see their messages stand out", async ({
  browser,
}) => {
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
    await moderator.getByLabel("Password").fill("not the password");
    await moderator.getByRole("button", { name: "Sign in" }).click();
    await expect(moderator.getByRole("dialog").getByRole("alert")).toHaveText(
      "Wrong username, email or password.",
    );

    await moderator.getByLabel("Password").fill(password);
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
      alice.getByRole("log").getByText(name, { exact: true }),
    ).toHaveClass(/text-green-400/);
    await expect(
      alice
        .getByRole("log")
        .getByRole("listitem")
        .filter({ hasText: words })
        .getByText("Moderator"),
    ).toBeVisible();
    await expect(alice.getByRole("complementary").getByText(name)).toHaveClass(
      /text-green-400/,
    );
  } finally {
    await payload.remove("admins", accountId);
  }
});

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
    await moderator.getByLabel("Password").fill(password);
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
      await moderator
        .getByRole("button", { name: "Choose how to send" })
        .click();
      const sendMenu = moderator.getByRole("menu");
      await expect(sendMenu).toBeVisible();
      const sendBounds = await sendMenu.boundingBox();
      const headerBounds = await moderator.locator("header").boundingBox();
      expect(sendBounds!.y).toBeGreaterThanOrEqual(
        headerBounds!.y + headerBounds!.height + 8 - 1,
      );
      await sendMenu.press("Escape");
    }
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
    await moderator.getByLabel("Password").fill(password);
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
    await moderator.getByLabel("Password").fill(password);
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

test("two guests write to each other privately, and a blocked guest is not heard", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");

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
  const fromAlice = conversations(bob).getByRole("button", { name: /^Alice/ });
  await expect(fromAlice).toHaveAccessibleName(/1 unread message/);
  await expect(fromAlice).toHaveClass(/animate-pulse/);
  await expect(bob.getByRole("log", { name: LOUNGE.name })).toContainText(
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
  await expect(conversation(alice, "Bob")).toContainText("Bob has blocked you");
  await expect(
    alice.getByRole("textbox", { name: "Message to Bob" }),
  ).toBeDisabled();
  await expect(conversation(bob, "Alice")).not.toContainText(
    "Bob has blocked you",
  );
});

test("reloading the page, or opening its address, brings a guest back to their room", async ({
  browser,
}) => {
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
});

test("a guest's chosen avatar is shown to others, and a conversation says when the other person leaves and returns", async ({
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

  // When Bea leaves the room, the conversation says so, with a time; when she returns, it says that too.
  await leaveRoom(bob);
  await expect(conversation.getByText("Bea left the room.")).toBeVisible();
  await bob.getByRole("button", { name: `Join ${room.name}` }).click();
  await expect(conversation.getByText("Bea rejoined the room.")).toBeVisible();
});

test("a private message can be reacted to, and the sender sees it", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");
  await alice
    .getByRole("list", { name: "People in this room" })
    .getByRole("button", { name: "Open private chat with Bob" })
    .click();
  await send(alice, "a secret", "Bob");

  const line = bob
    .getByRole("log", { name: LOUNGE.name })
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
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");

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

  // Both read the same history: Bob's own copy says he left and came back, just as Alice's does.
  await expect(conversation(bob, "Alice")).toContainText("Bob left the room.");
  await expect(conversation(bob, "Alice")).toContainText(
    "Bob rejoined the room.",
  );

  // Alice was told Bob left and came back, and can carry on writing to him.
  await expect(conversation(alice, "Bob")).toContainText("Bob left the room.");
  await expect(conversation(alice, "Bob")).toContainText(
    "Bob rejoined the room.",
  );
  await send(alice, "after the reload", "Bob");
  await expect(alice.getByRole("alert")).toHaveCount(0);
  await expect(conversation(bob, "Alice")).toContainText("after the reload");

  await send(bob, "welcome back to me", "Alice");
  await expect(conversation(alice, "Bob")).toContainText("welcome back to me");
});

test("a reload leaves a conversation closed when the other person is no longer in the room", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  await enterRoom(bob, LOUNGE.name, "Bob");

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
  await expect(bob.getByText("Alice left the room.").first()).toBeVisible();
  await bob.reload();

  // The room is shown, not the conversation, which is still in the list.
  await expect(bob.getByRole("log", { name: LOUNGE.name })).toBeVisible();
  await expect(
    bob
      .getByRole("list", { name: "Direct messages" })
      .getByRole("button", { name: /^Alice/ }),
  ).toBeVisible();
});

test("the room says who comes and goes, unless a guest switches that off", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");
  const room = alice.getByRole("log", { name: LOUNGE.name });
  // The setting is an item of the burger menu, which closes again when it is used.
  const openSetting = async () => {
    await alice.getByRole("button", { name: /^(Menu|Account menu:)/ }).click();

    return alice.getByRole("menuitem", {
      name: "Joins and leaves",
    });
  };
  await expect(await openSetting()).toHaveAttribute("aria-checked", "true");
  await alice.keyboard.press("Escape");

  const bob = await newGuest(browser);
  await enterRoom(bob, LOUNGE.name, "Bob");
  await expect(room).toContainText("Bob joined the room.");

  await leaveRoom(bob);
  // Departures are announced only after the grace period, in case the guest comes straight back.
  await expect(room).toContainText("Bob left the room.", { timeout: 25_000 });

  await (await openSetting()).click();
  await expect(room).not.toContainText("Bob left the room.");

  // The choice belongs to the browser, so a reload keeps it.
  await alice.reload();
  await expect(
    alice.getByRole("button", { name: "Account menu: Alice" }),
  ).toBeVisible();
  await expect(await openSetting()).toHaveAttribute("aria-checked", "false");
});

test("a nickname somebody in the room has is refused, and free again once they leave", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const other = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");

  await startJoin(other, LOUNGE.name, "alice");
  await expect(other.getByRole("alert")).toContainText(
    "Somebody in this room already has that nickname.",
  );
  await expect(
    other.getByRole("button", { name: /^Account menu:/ }),
  ).toHaveCount(0);

  await leaveRoom(alice);
  await other.getByRole("button", { name: "Continue" }).click();
  await expect(
    other.getByRole("button", { name: "Account menu: alice" }),
  ).toBeVisible();
});
