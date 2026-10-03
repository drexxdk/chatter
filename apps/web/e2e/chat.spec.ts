import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { waitForConnectionState, waitForRooms } from "./chatServer";
import { E2E } from "./constants";
import { PayloadApi } from "./payload";

const LOUNGE = {
  name: "E2E Lounge",
  slug: `${E2E.slugPrefix}lounge`,
  maxMembers: 5,
};
const TINY = { name: "E2E Tiny", slug: `${E2E.slugPrefix}tiny`, maxMembers: 1 };

const payload = new PayloadApi();
const roomIds: number[] = [];

test.beforeAll(async () => {
  await payload.login();

  for (const room of [LOUNGE, TINY]) {
    roomIds.push(
      await payload.createRoom(room.name, room.slug, room.maxMembers),
    );
  }

  // The chat-server picks new rooms up on its next cache sync.
  await waitForRooms([LOUNGE.slug, TINY.slug]);
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

async function startJoin(page: Page, roomName: string, nickname: string) {
  await page.goto("/");
  await page.getByRole("button", { name: `Join ${roomName}` }).click();
  await page.getByRole("textbox", { name: "Nickname" }).fill(nickname);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function enterRoom(page: Page, roomName: string, nickname: string) {
  await startJoin(page, roomName, nickname);
  await expect(
    page.getByRole("heading", { name: roomName, level: 2 }),
  ).toBeVisible();
}

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test("two guests chat in real time and see each other come and go", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);

  await enterRoom(alice, LOUNGE.name, "Alice");
  await expect(
    alice.getByRole("heading", { name: "In this room (1)" }),
  ).toBeVisible();

  await enterRoom(bob, LOUNGE.name, "Bob");
  await expect(
    alice.getByRole("heading", { name: "In this room (2)" }),
  ).toBeVisible();
  await expect(
    bob.getByRole("heading", { name: "In this room (2)" }),
  ).toBeVisible();

  // Message text must be shown literally, never interpreted as HTML.
  const markup = `<img src=x onerror="document.title='pwned'">`;
  await send(bob, markup);
  await expect(alice.getByRole("log")).toContainText(markup);
  await expect(alice.locator("img")).toHaveCount(0);
  await expect(alice).toHaveTitle("Chatter");

  await send(alice, "Hi Bob!");
  await expect(bob.getByRole("log")).toContainText("Hi Bob!");

  await bob.getByRole("button", { name: "Leave room" }).click();
  await expect(
    alice.getByRole("heading", { name: "In this room (1)" }),
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
    alice.getByRole("heading", { name: "In this room (2)" }),
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
    bob.getByRole("heading", { name: "In this room (2)" }),
  ).toBeVisible();
  await send(bob, "welcome back");
  await expect(alice.getByRole("log")).toContainText("welcome back");
  await send(alice, "I'm back");
  await expect(bob.getByRole("log")).toContainText("I'm back");
});

test("a full room turns the next guest away", async ({ browser }) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);

  await enterRoom(alice, TINY.name, "Alice");

  await startJoin(bob, TINY.name, "Bob");
  await expect(bob.getByRole("alert")).toHaveText("This room is full.");
  await expect(
    bob.getByRole("heading", { name: "Public rooms" }),
  ).toBeVisible();
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
