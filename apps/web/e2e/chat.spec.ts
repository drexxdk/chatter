import {
  expect,
  test,
  type Browser,
  type BrowserContext,
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
    alice.getByRole("heading", { name: "In this room (2)" }),
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

test("a room whose slow mode is left empty still has the server's default", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  await enterRoom(alice, LOUNGE.name, "Alice");

  await expect(
    alice.getByText(
      `Slow mode: one message every ${E2E.defaultSlowModeSeconds} s.`,
    ),
  ).toBeVisible();
});

test("a room with slow mode makes a guest wait between messages", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  await enterRoom(alice, SLOW.name, "Alice");
  await expect(
    alice.getByText("Slow mode: one message every 3 s."),
  ).toBeVisible();

  await send(alice, "first");
  await expect(alice.getByRole("log")).toContainText("first");

  // Straight away: refused, with the draft kept and the wait explained.
  await send(alice, "too soon");
  await expect(alice.getByRole("alert")).toContainText(
    /You can send again in [1-3] s\./,
  );
  await expect(alice.getByRole("textbox", { name: "Message" })).toHaveValue(
    "too soon",
  );
  await expect(alice.getByRole("log")).not.toContainText("too soon");

  // Once the wait is over the same draft goes through.
  await expect(async () => {
    await alice.getByRole("button", { name: "Send" }).click();
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
      .getByRole("button", { name: `Join ${LOUNGE.name}` })
      .click();
    await moderator
      .getByRole("button", { name: "Sign in as moderator" })
      .click();

    // A wrong password is explained and nothing is joined.
    await moderator.getByRole("textbox", { name: "Email" }).fill(email);
    await moderator.getByLabel("Password").fill("not the password");
    await moderator.getByRole("button", { name: "Sign in" }).click();
    await expect(moderator.getByRole("dialog").getByRole("alert")).toHaveText(
      "Wrong email or password.",
    );

    await moderator.getByLabel("Password").fill(password);
    await moderator.getByRole("button", { name: "Sign in" }).click();
    await expect(moderator.getByText(`Chatting as ${name}`)).toBeVisible();

    await send(moderator, words);

    const message = alice.getByRole("log").getByText(words);
    await expect(message).toBeVisible();
    await expect(message).toHaveClass(/font-bold/);
    await expect(alice.getByRole("log").getByText(name)).toHaveClass(
      /text-green-400/,
    );
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
    await expect(alice.getByLabel("Announce to everyone")).toHaveCount(0);

    const moderator = await newGuest(browser);
    await moderator.goto("/");
    await moderator
      .getByRole("button", { name: `Join ${LOUNGE.name}` })
      .click();
    await moderator
      .getByRole("button", { name: "Sign in as moderator" })
      .click();
    await moderator.getByRole("textbox", { name: "Email" }).fill(email);
    await moderator.getByLabel("Password").fill(password);
    await moderator.getByRole("button", { name: "Sign in" }).click();
    await expect(moderator.getByText(`Chatting as ${name}`)).toBeVisible();

    await moderator.getByLabel("Announce to everyone").fill(words);
    await moderator.getByRole("button", { name: "Announce" }).click();

    await expect(announcementOn(alice)).toContainText(words);
    await expect(announcementOn(alice)).toContainText(
      `Announcement from ${name}`,
    );

    // Somebody who arrives afterwards is shown it too.
    const bob = await newGuest(browser);
    await enterRoom(bob, LOUNGE.name, "Bob");
    await expect(announcementOn(bob)).toContainText(words);

    // A second one straight away is refused, and the words are kept for later.
    await moderator.getByLabel("Announce to everyone").fill("Too soon");
    await moderator.getByRole("button", { name: "Announce" }).click();
    await expect(moderator.getByRole("alert")).toContainText(
      /You can announce again in \d+ s\./,
    );
    await expect(moderator.getByLabel("Announce to everyone")).toHaveValue(
      "Too soon",
    );
    await expect(announcementOn(alice)).not.toContainText("Too soon");

    await alice.getByRole("button", { name: "Dismiss" }).click();
    await expect(announcementOn(alice)).toHaveCount(0);
    await expect(announcementOn(bob)).toBeVisible();
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
    await moderator.goto("/");
    await moderator
      .getByRole("button", { name: `Join ${LOUNGE.name}` })
      .click();
    await moderator
      .getByRole("button", { name: "Sign in as moderator" })
      .click();
    await moderator.getByRole("textbox", { name: "Email" }).fill(email);
    await moderator.getByLabel("Password").fill(password);
    await moderator.getByRole("button", { name: "Sign in" }).click();
    await expect(
      moderator.getByRole("heading", { name: LOUNGE.name, level: 2 }),
    ).toBeVisible();

    await payload.remove("admins", accountId);
    removed = true;

    // The chat server notices on its next sync.
    await expect(moderator.getByRole("alert")).toHaveText(
      "Your moderator session has expired. Sign in again.",
    );
    await expect(
      moderator.getByRole("heading", { name: "Public rooms" }),
    ).toBeVisible();
  } finally {
    if (!removed) await payload.remove("admins", accountId);
  }
});
