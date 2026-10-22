import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { waitForRooms } from "./chatServer";
import { CHAT_SERVER_URL, E2E } from "./constants";
import { PayloadApi } from "./payload";

const ROOM = {
  name: "E2E Accounts",
  slug: `${E2E.slugPrefix}accounts`,
  maxMembers: 10,
};
const payload = new PayloadApi();
let roomId = 0;

// Each of these goes through a sign-in, a form and several browsers.
test.setTimeout(60_000);

// Names and provider users that are only these tests': unique for each run, and swept (see payload.ts) if a run is cut
// short. The username has no spaces and starts with what the sweep looks for; the display name is what the chat shows.
const RUN = Date.now().toString(36);
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
  for (const user of await payload.findUsers(E2E.nicknamePrefix)) {
    await payload.remove("users", user.id);
  }
});

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "en-US" });
  contexts.push(context);
  return context.newPage();
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

test("a guest claims their profile with a password and can sign in again from the header", async ({
  browser,
}) => {
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
  await page.getByRole("button", { name: `Account menu: ${chatName}` }).click();
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
      const dialog = field.closest('[role="dialog"]')!.getBoundingClientRect();
      return (
        box.left >= dialog.left &&
        box.right <= dialog.right &&
        Array.from(field.querySelectorAll("input, button")).every((control) => {
          const bounds = control.getBoundingClientRect();
          return (
            bounds.left >= box.left &&
            bounds.right <= box.right &&
            bounds.width > 0
          );
        })
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
  await profile.getByRole("button", { name: "Edit profile" }).click();
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

  await page.getByRole("button", { name: `Account menu: ${chatName}` }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const login = page.getByRole("dialog", { name: "Sign in" });
  await expect(
    login.getByRole("link", { name: "Continue with Dev sign-in" }),
  ).toBeVisible();
  await login.getByLabel("Username or email").fill(handle.toUpperCase());
  await login.getByLabel("Password", { exact: true }).fill(password);
  await login.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Account menu: ${chatName}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await inRoom(page);
  await page.getByRole("button", { name: `Account menu: ${chatName}` }).click();
  await page
    .getByRole("menuitem", { name: "Your profile", exact: true })
    .click();
  await profile.getByRole("button", { name: "Edit profile" }).click();
  await expect(day).toHaveValue("01");
  await expect(month).toHaveText("January");
  await expect(year).toHaveValue(birthDate.slice(0, 4));
  await expect(profile.getByText("35 years old")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a guest connects a provider and stays who they are, the names are theirs, and they can sign in again elsewhere", async ({
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
  await expect(page.getByRole("dialog").getByText("Dev sign-in")).toBeVisible();

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

  // Nobody else can have the name now, not even a guest who types it, or the username.
  for (const taken of [chatName, handle]) {
    const other = await newPage(browser);
    await joinAsGuest(other, taken);
    await expect(other.getByRole("alert")).toContainText(
      "That nickname is reserved",
    );
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
  await page.getByRole("radio", { name: "Female" }).check({ force: true });
  await page.getByRole("radio", { name: "Avatar 2" }).check({ force: true });
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
  await expect(dialog.getByText("Dev sign-in")).toBeVisible();
  await expect(dialog.getByText("Not given")).toBeVisible();
  await expect(dialog.getByLabel("Display name")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Edit profile" }).click();
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

  await expect(dialog.getByText("33 years old")).toBeVisible();
  await expect(dialog.getByText("Male", { exact: true })).toBeVisible();
  await expect
    .poll(() => accountsNamed(handle))
    .toEqual([
      expect.objectContaining({ displayName: renamed, avatar: "male" }),
    ]);

  await page.reload();
  await expect(dialog.getByText("33 years old")).toBeVisible();
  await expect(dialog.getByText(renamed, { exact: true })).toBeVisible();

  // Joining a room afterwards is as the new name.
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await inRoom(page);
  await expect(
    page.getByRole("button", { name: `Account menu: ${renamed}` }),
  ).toBeVisible();
});
