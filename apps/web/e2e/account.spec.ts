import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { accountOf, KEY, type Account } from "../src/account";
import type { AccountSession } from "../src/api";
import { waitForRooms } from "./chatServer";
import { CHAT_SERVER_URL, E2E, WEB_URL } from "./constants";
import { PayloadApi } from "./payload";

const RUN = Date.now().toString(36);
const ROOM = {
  name: `E2E Accounts ${RUN}`,
  slug: `${E2E.slugPrefix}accounts-${RUN}`,
  maxMembers: 10,
};
const payload = new PayloadApi();
let roomId = 0;

// Each of these goes through a sign-in, a form and several browsers.
test.setTimeout(60_000);

// Names and provider users that are only these tests': unique for each run, and swept (see payload.ts) if a run is cut
// short. The username has no spaces and starts with what the sweep looks for; the display name is what the chat shows.
const displayName = (who: string) => `E2EAcc ${who} ${RUN}`;
const username = (who: string) => `E2EAcc${who}${RUN}`;
const providerUser = (who: string) => `e2eacc-${who}-${RUN}`;

test.beforeAll(async () => {
  await payload.login();
  roomId = await payload.createRoom(ROOM.name, ROOM.slug, ROOM.maxMembers);
  await waitForRooms([ROOM.slug]);
});

test.afterAll(async () => {
  await payload.remove("public-rooms", roomId);
  await payload.removeRunUsers(RUN);
});

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function newPage(browser: Browser, account?: Account): Promise<Page> {
  const context = await browser.newContext({
    locale: "en-US",
    extraHTTPHeaders: {
      "X-Forwarded-For": `10.${crypto.getRandomValues(new Uint8Array(3)).join(".")}`,
    },
    ...(account
      ? {
          storageState: {
            cookies: [],
            origins: [
              {
                origin: WEB_URL,
                localStorage: [{ name: KEY, value: JSON.stringify(account) }],
              },
            ],
          },
        }
      : {}),
  });
  contexts.push(context);
  return context.newPage();
}

async function signedInPage(
  browser: Browser,
  request: APIRequestContext,
  username: string,
  password: string,
) {
  if (process.env.E2E_TURNSTILE === "true") {
    const page = await newPage(browser);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const login = page.getByRole("dialog", { name: "Sign in", exact: true });
    await login.getByLabel("Username or email").fill(username);
    await login.getByLabel("Password", { exact: true }).fill(password);
    await login.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(login).not.toBeVisible();
    return page;
  }
  const response = await request.post(
    `${CHAT_SERVER_URL}/auth/password/login`,
    {
      data: { username, password },
      headers: {
        "X-Forwarded-For": `10.${crypto.getRandomValues(new Uint8Array(3)).join(".")}`,
      },
    },
  );
  expect(response.ok()).toBe(true);
  const session = (await response.json()) as AccountSession;
  expect(session.profile.username).toBe(username);
  const page = await newPage(browser, accountOf(session));
  await page.goto("/");
  return page;
}

// Goes through the stand-in provider, which asks only who is signing in.
async function signInWithProvider(page: Page, who: string) {
  await page.getByRole("link", { name: "Continue with Dev sign-in" }).click();
  await page.getByLabel("Who are you?").fill(providerUser(who));
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function joinAsGuest(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await page.getByRole("textbox", { name: "Nickname" }).fill(name);
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  if (process.env.E2E_TURNSTILE === "true") {
    const challenge = page.getByRole("group", {
      name: "Human verification",
      exact: true,
    });
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(challenge).toBeVisible();
      await expect
        .poll(async () =>
          challenge.evaluate((frame) => {
            const box = frame.getBoundingClientRect();
            const dialog = frame
              .closest('[role="dialog"]')!
              .getBoundingClientRect();
            return (
              box.width > 0 &&
              box.height >= 50 &&
              frame.scrollWidth <= box.width + 1 &&
              box.left >= dialog.left &&
              box.right <= dialog.right
            );
          }),
        )
        .toBe(true);
      await expect(
        page.getByRole("button", { name: "Continue", exact: true }),
      ).toBeEnabled({ timeout: 15000 });
      await page.screenshot({
        path: test.info().outputPath(`guest-turnstile-${width}.png`),
      });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

// The accounts of this run with this username; the tests leave their accounts until the end.
const accountsNamed = async (name: string) =>
  (await payload.findUsers(E2E.nicknamePrefix)).filter(
    (user) => user.nickname === name,
  );

const inRoom = (page: Page) =>
  expect(
    page.getByRole("heading", { name: ROOM.name, level: 2 }),
  ).toBeVisible();

test("lobby loading keeps the room heading and saved account menu stable", async ({
  browser,
}) => {
  const page = await newPage(browser);
  const chatName = displayName("Load");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await signInWithProvider(page, "load");
  await page.getByLabel("Username").fill(username("Load"));
  await page.getByLabel("Display name").fill(chatName);
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await inRoom(page);

  await page.addInitScript(() => {
    Reflect.set(window, "settingsFlashed", false);
    new MutationObserver(() => {
      if (document.querySelector('header button[aria-label="Settings"]'))
        Reflect.set(window, "settingsFlashed", true);
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-label"],
    });
  });

  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const responsesReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Set<string>();
    await page.route(/\/(?:rooms|me)$/, async (route) => {
      waiting.add(new URL(route.request().url()).pathname);
      await responsesReady;
      await route.continue();
    });
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const lobby = page.getByRole("region", { name: "Public rooms" });
      const heading = lobby.getByRole("heading", { name: "Public rooms" });
      const intro = lobby.locator("p").first();
      const menu = page.getByRole("button", {
        name: `Account menu: ${chatName}`,
      });
      await expect(lobby.getByRole("status")).toContainText("Loading rooms");
      await expect(menu).toBeVisible();
      await expect
        .poll(() => waiting.has("/rooms") && waiting.has("/me"))
        .toBe(true);
      const loader = await lobby
        .getByRole("status")
        .locator("svg")
        .boundingBox();
      expect(loader).not.toBeNull();
      const viewportHeight = page.viewportSize()!.height;
      expect(
        Math.abs(loader!.y + loader!.height / 2 - viewportHeight / 2),
      ).toBeLessThan(viewportHeight / 10);
      const before = {
        heading: (await heading.boundingBox())!,
        intro: (await intro.boundingBox())!,
        menu: (await menu.boundingBox())!,
      };
      expect(
        await page.evaluate(() => Reflect.get(window, "settingsFlashed")),
      ).toBe(false);
      await page.screenshot({
        path: test.info().outputPath(`lobby-loading-${width}.png`),
      });

      release();
      await expect(
        lobby.getByRole("button", { name: `Join ${ROOM.name}` }),
      ).toBeVisible();
      for (const [element, position] of [
        [heading, before.heading],
        [intro, before.intro],
        [menu, before.menu],
      ] as const) {
        await expect
          .poll(async () =>
            Math.abs((await element.boundingBox())!.y - position.y),
          )
          .toBeLessThanOrEqual(1);
      }
      expect(
        await page.evaluate(() => Reflect.get(window, "settingsFlashed")),
      ).toBe(false);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`lobby-loaded-${width}.png`),
      });
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  }
});

test("accounts share display names with distinct public identities and private recipients", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const chatName = displayName("Shared");
  const first = await newPage(browser);
  const second = await newPage(browser);
  for (const [index, page] of [first, second].entries()) {
    await joinAsGuest(page, chatName);
    await inRoom(page);
    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page
      .getByRole("menuitem", { name: "Claim account", exact: true })
      .click();
    const form = page.getByRole("dialog", { name: "Claim account" });
    await form
      .getByLabel("Username", { exact: true })
      .fill(username(`Shared${index}`));
    await form
      .getByLabel("Password", { exact: true })
      .fill("SharedIdentity123");
    await form.getByLabel("Confirm password").fill("SharedIdentity123");
    await form
      .getByRole("button", { name: "Claim account", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Your profile" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await inRoom(page);
    await expect(
      page
        .getByRole("list", { name: "People in this room" })
        .locator("li")
        .filter({ hasText: "(you)" })
        .getByRole("button", {
          name: index === 0 ? `Profile: ${chatName}` : /\u00b7 [A-Z0-9]{8,}$/,
          exact: true,
        }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill(`Shared author ${index}`);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText(`Shared author ${index}`, { exact: true }),
    ).toBeVisible();
  }
  const observer = await newPage(browser);
  await observer.setViewportSize({ width: 1280, height: 900 });
  await joinAsGuest(observer, displayName("Watch"));
  await inRoom(observer);
  const people = observer.getByRole("list", { name: "People in this room" });
  const recipients = people.getByRole("button", {
    name: new RegExp(`^Open private chat with ${chatName}`),
  });
  await expect(recipients).toHaveCount(2);
  expect(await recipients.nth(0).getAttribute("aria-label")).not.toBe(
    await recipients.nth(1).getAttribute("aria-label"),
  );
  const own = first
    .getByRole("list", { name: "People in this room" })
    .locator("li")
    .filter({ hasText: "(you)" });
  const profileLabel = (await own
    .getByRole("button", { name: /^Profile:/ })
    .getAttribute("aria-label"))!;
  const tag = profileLabel.split(" \u00b7 ")[1]!;
  await people.getByRole("button", { name: profileLabel, exact: true }).click();
  await expect(
    observer.getByRole("dialog").getByText(tag, { exact: true }),
  ).toBeVisible();
  await observer.keyboard.press("Escape");
  await people
    .getByRole("button", {
      name: `Open private chat with ${chatName} \u00b7 ${tag}`,
      exact: true,
    })
    .click();
  const privateText = `Private target ${RUN}`;
  const composer = observer.getByRole("textbox", { name: /^Message to / });
  await composer.fill(privateText);
  await composer.press("Enter");
  await expect(first.getByText(privateText, { exact: true })).toBeVisible();
  await expect(second.getByText(privateText, { exact: true })).toHaveCount(0);
  await observer
    .getByRole("button", { name: "Back to the room", exact: true })
    .click();
  for (const width of [1280, 375, 320]) {
    await observer.setViewportSize({ width, height: 900 });
    await expect(
      observer.getByText("Shared author 0", { exact: true }),
    ).toBeVisible();
    await expect(
      observer.getByText("Shared author 1", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        observer.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await observer.screenshot({
      path: test.info().outputPath(`shared-identities-${width}.png`),
    });
  }
});

test("notification choices follow the account into a different browser", async ({
  browser,
  request,
}) => {
  const chatName = displayName("Sounds");
  const handle = username("Sounds");
  const password = "SoundSettings123";
  await payload.createPasswordUser(handle, chatName, password);
  const page = await signedInPage(browser, request, handle, password);
  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await inRoom(page);
  const openSettings = async (target: Page) => {
    await target
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await target
      .getByRole("menuitem", { name: "Settings", exact: true })
      .click();
    const dialog = target.getByRole("dialog", {
      name: "Settings",
      exact: true,
    });
    await expect(
      dialog.getByRole("checkbox", { name: "Warnings", exact: true }),
    ).toBeEnabled();
    return dialog;
  };
  const settings = await openSettings(page);
  await settings.getByRole("checkbox", { name: "Warnings" }).check();
  await settings.getByRole("checkbox", { name: "People joining" }).check();
  await settings.getByRole("button", { name: "Sound for Warnings" }).click();
  await page.getByRole("option", { name: "Bell", exact: true }).click();
  await settings
    .getByRole("button", { name: "Sound for People joining" })
    .click();
  await page.getByRole("option", { name: "Wood", exact: true }).click();
  const volume = settings.getByRole("slider", { name: "Volume" });
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/me/notifications" &&
      response.request().method() === "PATCH" &&
      response.request().postDataJSON().volume === 0.37 &&
      response.ok(),
  );
  await volume.focus();
  await volume.press("Home");
  for (let step = 0; step < 37; step += 1) await volume.press("ArrowRight");
  await saved;
  await expect(settings.getByText("Saved", { exact: true })).toHaveCount(0);
  const otherBrowser = await signedInPage(browser, request, handle, password);
  await expect(
    otherBrowser.getByRole("button", { name: `Account menu: ${chatName}` }),
  ).toBeVisible();
  const restored = await openSettings(otherBrowser);
  await expect(
    restored.getByRole("checkbox", { name: "Private message sounds" }),
  ).not.toBeChecked();
  await expect(
    restored.getByRole("checkbox", { name: "Warnings" }),
  ).toBeChecked();
  await expect(
    restored.getByRole("checkbox", { name: "People joining" }),
  ).toBeChecked();
  await expect(
    restored.getByRole("button", { name: "Sound for Warnings" }),
  ).toHaveText("Bell");
  await expect(
    restored.getByRole("button", { name: "Sound for People joining" }),
  ).toHaveText("Wood");
  await expect(restored.getByRole("slider", { name: "Volume" })).toHaveValue(
    "37",
  );
  expect(
    await otherBrowser.evaluate(() =>
      localStorage.getItem("chatter.notificationSound"),
    ),
  ).toBeNull();
});

for (const width of [375, 1280]) {
  test(`guest account navigation is separate from their profile at ${width}px`, async ({
    browser,
  }) => {
    const page = await newPage(browser);
    await page.setViewportSize({ width, height: 900 });
    const chatName = displayName(`Nav${width}`);
    await joinAsGuest(page, chatName);
    await inRoom(page);
    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Sign in to an existing account" }),
    ).toBeVisible();
    await page
      .getByRole("menuitem", { name: "Claim account", exact: true })
      .click();
    const creation = page.getByRole("dialog", {
      name: "Claim account",
      exact: true,
    });
    await expect(
      creation.getByRole("link", { name: "Continue with Dev sign-in" }),
    ).toBeVisible();
    await expect(
      creation.getByLabel("Password", { exact: true }),
    ).toBeVisible();
    await expect(creation.getByLabel("Confirm password")).toBeVisible();
    await expect(
      creation.getByRole("button", { name: "Use a password", exact: true }),
    ).toHaveCount(0);
    await expect(
      creation.getByRole("button", { name: "Back", exact: true }),
    ).toHaveCount(0);
    await creation.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page
      .getByRole("menuitem", { name: "Your profile", exact: true })
      .click();
    const profile = page.getByRole("dialog", { name: "Your profile" });
    await expect(profile.getByText("Guest", { exact: true })).toBeVisible();
    await expect(profile.getByRole("link")).toHaveCount(0);
    await expect(profile.locator("input")).toHaveCount(0);
    await expect(
      profile.getByRole("button", { name: "Sign out", exact: true }),
    ).toHaveCount(0);
    await profile
      .getByRole("button", { name: "Claim account", exact: true })
      .click();
    await expect(creation.getByLabel("Confirm password")).toBeVisible();
    await creation.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page
      .getByRole("menuitem", { name: "Sign in to an existing account" })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "Sign in", exact: true })
        .getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page
      .getByRole("menuitem", { name: "End guest session", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Public rooms" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
  });
}

test(
  "a guest claims their profile with a password and can sign in again from the header",
  { tag: "@smoke" },
  async ({ browser }) => {
    const page = await newPage(browser);
    const chatName = displayName("Pass");
    const handle = username("Pass");
    const password = "A private password for this test 1";
    if (process.env.E2E_TURNSTILE === "true") {
      const missing = await page.request.post(
        `${CHAT_SERVER_URL}/auth/password/login`,
        { data: { username: handle, password } },
      );
      expect(missing.status()).toBe(400);
      expect(await missing.json()).toEqual({ error: "human_check_required" });
    }
    const birthDate = `${new Date().getUTCFullYear() - 35}-01-01`;
    const presenceFrames: string[] = [];
    page.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => {
        if (typeof payload === "string" && payload.includes('"room:presence"'))
          presenceFrames.push(payload);
      }),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await joinAsGuest(page, chatName);
    await inRoom(page);
    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page.getByRole("menuitem", { name: "Your profile" }).click();
    const profile = page.getByRole("dialog", { name: "Your profile" });
    await profile.getByRole("button", { name: "Edit profile" }).click();
    const dateField = profile.getByRole("group", { name: "Date of birth" });
    const day = dateField.getByLabel("Day", { exact: true });
    const month = dateField.getByRole("button", { name: "Month", exact: true });
    const year = dateField.getByLabel("Year", { exact: true });
    await day.fill("1");
    await month.click();
    await page.getByRole("option", { name: "January", exact: true }).click();
    await year.fill(birthDate.slice(0, 4));
    await expect(profile.getByText("35 years old")).toBeVisible();
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dateField).toBeVisible();
      const fits = await dateField.evaluate((field) => {
        const box = field.getBoundingClientRect();
        const dialog = field
          .closest('[role="dialog"]')!
          .getBoundingClientRect();
        return (
          box.left >= dialog.left &&
          box.right <= dialog.right &&
          Array.from(field.querySelectorAll("input, button")).every(
            (control) => {
              const bounds = control.getBoundingClientRect();
              return (
                bounds.left >= box.left &&
                bounds.right <= box.right &&
                bounds.width > 0
              );
            },
          )
        );
      });
      expect(fits).toBe(true);
      await month.click();
      const months = page.getByRole("listbox");
      await expect(months).toBeVisible();
      const popup = await months.boundingBox();
      expect(popup!.x).toBeGreaterThanOrEqual(0);
      expect(popup!.x + popup!.width).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath(`birth-date-${width}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(months).not.toBeVisible();
    }
    await profile.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      profile.getByRole("button", { name: "Edit profile" }),
    ).toBeVisible();
    await expect(profile.getByText("35 years old")).toBeVisible();
    await expect
      .poll(() => presenceFrames.some((frame) => frame.includes('"age":35')))
      .toBe(true);
    expect(
      presenceFrames.every(
        (frame) => !frame.includes("birthDate") && !frame.includes(birthDate),
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: ROOM.name,
        level: 2,
        includeHidden: true,
      }),
    ).toBeVisible();
    await expect(profile).toBeVisible();
    const editProfile = profile.getByRole("button", { name: "Edit profile" });
    await expect(
      editProfile.or(
        profile.getByRole("button", { name: "Save", exact: true }),
      ),
    ).toBeVisible();
    if (await editProfile.isVisible()) await editProfile.click();
    await expect(day).toHaveValue("01");
    await expect(month).toHaveText("January");
    await expect(year).toHaveValue(birthDate.slice(0, 4));
    await profile.getByRole("button", { name: "Cancel", exact: true }).click();
    await profile
      .getByRole("button", { name: "Claim account", exact: true })
      .click();
    const registration = page.getByRole("dialog", { name: "Claim account" });
    await registration.getByLabel("Username", { exact: true }).fill(handle);
    await registration.getByLabel("Password", { exact: true }).fill(password);
    await registration
      .getByLabel("Confirm password")
      .fill("a different password");
    await registration
      .getByRole("button", { name: "Claim account", exact: true })
      .click();
    await expect(registration.getByRole("alert")).toContainText(
      "The passwords do not match",
    );
    await registration.getByLabel("Confirm password").fill(password);
    await registration
      .getByRole("button", { name: "Claim account", exact: true })
      .click();
    await expect(
      profile.getByText("Signed in with", { exact: true }),
    ).toBeVisible();
    await expect(profile.getByText("Password", { exact: true })).toBeVisible();
    await profile.getByRole("button", { name: "Close" }).click();
    await inRoom(page);
    const [account] = await accountsNamed(handle);
    expect(account).toMatchObject({
      provider: "password",
      nickname: handle,
      displayName: chatName,
    });
    expect(account).not.toHaveProperty("passwordHash");
    expect(account).not.toHaveProperty("birthDate");
    expect(
      await page.evaluate(() => localStorage.getItem("chatter.account")),
    ).not.toContain(password);

    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page
      .getByRole("menuitem", { name: "Your profile", exact: true })
      .click();
    const renamedHandle = username("Pass3");
    for (const nextUsername of [username("Pass2"), renamedHandle]) {
      await profile.getByRole("button", { name: "Edit profile" }).click();
      await expect(profile.getByLabel("Username", { exact: true })).toHaveValue(
        nextUsername === renamedHandle ? username("Pass2") : handle,
      );
      await profile.getByLabel("Username", { exact: true }).fill(nextUsername);
      for (const width of [1280, 375]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await profile.evaluate(
            (dialog) => dialog.scrollWidth <= dialog.clientWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: test.info().outputPath(`username-${nextUsername}-${width}.png`),
        });
      }
      await profile.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        profile.getByRole("button", { name: "Edit profile" }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("chatter.account") ?? "null")
                ?.username,
          ),
        )
        .toBe(nextUsername);
    }
    expect(await accountsNamed(handle)).toEqual([]);
    expect((await accountsNamed(renamedHandle))[0]?.id).toBe(account.id);
    expect(
      presenceFrames.every(
        (frame) =>
          !frame.includes('"username"') && !frame.includes(renamedHandle),
      ),
    ).toBe(true);
    await profile.getByRole("button", { name: "Close", exact: true }).click();

    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const login = page.getByRole("dialog", { name: "Sign in" });
    await expect(
      login.getByRole("link", { name: "Continue with Dev sign-in" }),
    ).toBeVisible();
    await login
      .getByLabel("Username or email")
      .fill(renamedHandle.toUpperCase());
    await login.getByLabel("Password", { exact: true }).fill(password);
    await login.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("button", { name: `Account menu: ${chatName}` }),
    ).toBeVisible();
    await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
    await inRoom(page);
    await page
      .getByRole("button", { name: `Account menu: ${chatName}` })
      .click();
    await page
      .getByRole("menuitem", { name: "Your profile", exact: true })
      .click();
    await profile.getByRole("button", { name: "Edit profile" }).click();
    await expect(profile.getByLabel("Username", { exact: true })).toHaveValue(
      renamedHandle,
    );
    await expect(day).toHaveValue("01");
    await expect(month).toHaveText("January");
    await expect(year).toHaveValue(birthDate.slice(0, 4));
    await expect(profile.getByText("35 years old")).toBeVisible();
    expect(errors).toEqual([]);
  },
);

test("a guest connects a provider, keeps their identity, shares public names, and can sign in elsewhere", async ({
  browser,
}) => {
  const chatName = displayName("Anna");
  const handle = username("Anna");
  const page = await newPage(browser);
  await joinAsGuest(page, chatName);
  await inRoom(page);

  // The profile in the header is where a guest makes an account.
  await page.getByRole("button", { name: `Account menu: ${chatName}` }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  await page
    .getByRole("dialog", { name: "Your profile" })
    .getByRole("button", { name: "Claim account", exact: true })
    .click();
  await signInWithProvider(page, "anna");

  // The form starts from who the guest was: the name they had, and a username made from it.
  await expect(page.getByLabel("Display name")).toHaveValue(chatName);
  await expect(page.getByLabel("Username")).toHaveValue(handle);
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  // Back in the same room, as the same person, now with an account.
  await inRoom(page);
  await page.getByRole("button", { name: `Account menu: ${chatName}` }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  await expect(page.getByText("Signed in with", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .locator("dl")
      .getByText("Dev sign-in", { exact: true }),
  ).toBeVisible();

  const [account] = await accountsNamed(handle);
  expect(account).toMatchObject({
    nickname: handle,
    displayName: chatName,
    provider: "dev",
    email: `${providerUser("anna")}@dev.test`,
  });
  expect(account?.picture).toMatch(
    /^(lorelei|pixel-art|critters|thumbs):[a-z0-9]{10}$/,
  );

  for (const taken of [chatName, handle]) {
    const other = await newPage(browser);
    await joinAsGuest(other, taken);
    await inRoom(other);
    await expect(
      other.getByRole("button", { name: `Account menu: ${taken}` }),
    ).toBeVisible();
  }

  // Another browser: the same provider account is the same account, and comes back into the room without being asked who it is.
  const elsewhere = await newPage(browser);
  await elsewhere.goto("/");
  await elsewhere.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await signInWithProvider(elsewhere, "anna");
  await inRoom(elsewhere);
  await expect(
    elsewhere.getByRole("button", { name: `Account menu: ${chatName}` }),
  ).toBeVisible();
  expect(await accountsNamed(handle)).toHaveLength(1);
});

test("somebody makes an account from the lobby, chooses who they are, and can delete it", async ({
  browser,
}) => {
  const chatName = displayName("Bea");
  const handle = username("Bea");
  const page = await newPage(browser);
  await page.goto("/");

  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await signInWithProvider(page, "bea");

  // Nobody has this provider account yet, so they choose a username, a name, an avatar and accept the terms.
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();

  // A space cannot be typed into the username; extra spaces in the display name are taken out when it is sent.
  const usernameBox = page.getByLabel("Username");
  await usernameBox.fill(`${handle} x`);
  await expect(usernameBox).toHaveValue(`${handle}x`);
  await usernameBox.fill(handle);
  await page.getByLabel("Display name").fill(`E2EAcc  Bea  ${RUN}`);
  const gender = page.getByRole("radio", { name: "Female", exact: true });
  await gender.locator("..").click();
  await expect(gender).toBeChecked();
  const picture = page.getByRole("radio", { name: "Avatar 2", exact: true });
  await picture.locator("..").click();
  await expect(picture).toBeChecked();
  const chosenPicture = await page
    .getByRole("radio", { name: "Avatar 2" })
    .inputValue();
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  // Back in the room that was being joined, signed in, and not asked for a nickname.
  await inRoom(page);
  await expect(
    page.getByRole("button", { name: `Account menu: ${chatName}` }),
  ).toBeVisible();
  expect(await accountsNamed(handle)).toEqual([
    expect.objectContaining({
      nickname: handle,
      displayName: chatName,
      picture: chosenPicture,
      avatar: "female",
    }),
  ]);

  // Deleting the account removes it, and both names are free for anybody again.
  await page.getByRole("button", { name: `Account menu: ${chatName}` }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByRole("button", { name: "Yes, delete my account" }).click();

  await expect(
    page.getByRole("heading", { name: "Public rooms" }),
  ).toBeVisible();
  await expect.poll(async () => (await accountsNamed(handle)).length).toBe(0);

  const guest = await newPage(browser);
  await joinAsGuest(guest, chatName);
  await inRoom(guest);
});

test("an account is edited from the lobby, where it is only shown until it is asked to change", async ({
  browser,
}) => {
  const chatName = displayName("Cleo");
  const renamed = displayName("Cleo2");
  const handle = username("Cleo");
  const renamedHandle = username("Cleo2");
  const finalHandle = username("Cleo3");
  const page = await newPage(browser);
  await page.goto("/");

  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await signInWithProvider(page, "cleo");
  await page.getByLabel("Username").fill(handle);
  await page.getByLabel("Display name").fill(chatName);
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await inRoom(page);

  // A tab with no chat connection yet (the connection is what the tab kept): the lobby's profile shows who they are,
  // and changes the account itself.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: `Account menu: ${chatName}` }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Your profile" });
  await expect(
    dialog.getByRole("definition").filter({ hasText: "Dev sign-in" }),
  ).toBeVisible();
  await expect(dialog.getByText("Not given")).toBeVisible();
  await expect(dialog.getByLabel("Display name")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Edit profile" }).click();
  await dialog.getByLabel("Username", { exact: true }).fill(renamedHandle);
  await dialog.getByLabel("Display name").fill(renamed);
  const birthYear = String(new Date().getUTCFullYear() - 33);
  await dialog.getByLabel("Day", { exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByRole("option", { name: "January", exact: true }).click();
  await dialog.getByLabel("Year", { exact: true }).fill(birthYear);
  await dialog
    .getByRole("radio", { name: "Male", exact: true })
    .check({ force: true });
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(
    dialog.getByRole("button", { name: "Edit profile" }),
  ).toBeVisible();
  await expect(dialog.getByText(renamed, { exact: true })).toBeVisible();
  await expect(dialog.getByText("33 years old")).toBeVisible();
  await expect(dialog.getByText("Male", { exact: true })).toBeVisible();
  await expect
    .poll(() => accountsNamed(renamedHandle))
    .toEqual([
      expect.objectContaining({ displayName: renamed, avatar: "male" }),
    ]);

  await expect(page).toHaveURL(
    (url) => url.searchParams.get("dialog") === "profile",
  );
  await page.reload();
  await expect(dialog.getByText("33 years old")).toBeVisible();
  await expect(dialog.getByText(renamed, { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Edit profile" }).click();
  await expect(dialog.getByLabel("Username", { exact: true })).toHaveValue(
    renamedHandle,
  );
  await expect(dialog.getByText(/must wait 24 hours/)).toBeVisible();
  await dialog.getByLabel("Display name").fill(displayName("Cleo3"));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    /display name again in \d+h \d+m \d+s/,
  );
  await expect(dialog.getByLabel("Display name")).toBeFocused();
  await expect(dialog.getByLabel("Display name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.screenshot({
    path: test.info().outputPath("display-name-cooldown.png"),
  });
  await dialog.getByLabel("Display name").fill(renamed);
  await dialog.getByLabel("Username", { exact: true }).fill(finalHandle);
  await dialog
    .getByRole("radio", { name: "Female", exact: true })
    .check({ force: true });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Female", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("chatter.account") ?? "null")
            ?.username,
      ),
    )
    .toBe(finalHandle);
  expect(await accountsNamed(renamedHandle)).toEqual([]);

  // Joining a room afterwards is as the new name.
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await inRoom(page);
  await expect(
    page.getByRole("button", { name: `Account menu: ${renamed}` }),
  ).toBeVisible();
});
