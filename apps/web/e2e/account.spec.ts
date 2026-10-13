import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { waitForRooms } from "./chatServer";
import { E2E } from "./constants";
import { PayloadApi } from "./payload";

const ROOM = {
  name: "E2E Accounts",
  slug: `${E2E.slugPrefix}accounts`,
  maxMembers: 10,
};
const payload = new PayloadApi();
let roomId = 0;

// Nicknames and provider users that are only these tests': unique for each run, and swept (see payload.ts) if a run
// is cut short.
const RUN = Date.now().toString(36);
const nickname = (who: string) => `E2EAcc ${who} ${RUN}`;
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
  await page.getByRole("button", { name: "Continue" }).click();
}

// The accounts of this run with this nickname; the tests leave their accounts until the end.
const accountsNamed = async (name: string) =>
  (await payload.findUsers(E2E.nicknamePrefix)).filter(
    (user) => user.nickname === name,
  );

const inRoom = (page: Page) =>
  expect(
    page.getByRole("heading", { name: ROOM.name, level: 2 }),
  ).toBeVisible();

test("a guest connects a provider and stays who they are, the nickname is theirs, and they can sign in again elsewhere", async ({
  browser,
}) => {
  const name = nickname("Anna");
  const page = await newPage(browser);
  await joinAsGuest(page, name);
  await inRoom(page);

  // The profile in the header is where a guest makes an account.
  await page.getByRole("button", { name: `Your profile: ${name}` }).click();
  await signInWithProvider(page, "anna");

  // Back in the same room, as the same person, now with an account.
  await inRoom(page);
  await page.getByRole("button", { name: `Your profile: ${name}` }).click();
  await expect(page.getByText("Signed in with Dev sign-in.")).toBeVisible();

  const [account] = await accountsNamed(name);
  expect(account).toMatchObject({
    nickname: name,
    provider: "dev",
    email: `${providerUser("anna")}@dev.test`,
  });

  // Nobody else can have the nickname now, not even a guest who types it.
  const other = await newPage(browser);
  await joinAsGuest(other, name);
  await expect(other.getByRole("alert")).toContainText(
    "That nickname is reserved",
  );

  // Another browser: the same provider account is the same account, and joins a room without being asked who it is.
  const elsewhere = await newPage(browser);
  await elsewhere.goto("/");
  await elsewhere.getByRole("button", { name: "Account", exact: true }).click();
  await signInWithProvider(elsewhere, "anna");
  await expect(
    elsewhere.getByRole("button", { name: `Your profile: ${name}` }),
  ).toBeVisible();
  await elsewhere.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await inRoom(elsewhere);
  expect(await accountsNamed(name)).toHaveLength(1);
});

test("somebody makes an account from the lobby, chooses who they are, and can delete it", async ({
  browser,
}) => {
  const name = nickname("Bea");
  const page = await newPage(browser);
  await page.goto("/");

  await page.getByRole("button", { name: "Account", exact: true }).click();
  await signInWithProvider(page, "bea");

  // Nobody has this provider account yet, so they choose a nickname, an avatar and accept the terms.
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Nickname" }).fill(name);
  await page.getByRole("radio", { name: "Female" }).check({ force: true });
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  // Back in the lobby, signed in, and a room needs no nickname.
  await expect(
    page.getByRole("button", { name: `Your profile: ${name}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Join ${ROOM.name}` }).click();
  await inRoom(page);
  expect(await accountsNamed(name)).toEqual([
    expect.objectContaining({ nickname: name, avatar: "female" }),
  ]);

  // Deleting the account removes it, and the nickname is free for anybody again.
  await page.getByRole("button", { name: `Your profile: ${name}` }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByRole("button", { name: "Yes, delete my account" }).click();

  await expect(
    page.getByRole("heading", { name: "Public rooms" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await accountsNamed(name)).length).toBe(0);

  const guest = await newPage(browser);
  await joinAsGuest(guest, name);
  await inRoom(guest);
});
