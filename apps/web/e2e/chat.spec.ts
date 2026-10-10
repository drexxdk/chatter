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
  await page.getByRole("button", { name: "Send", exact: true }).click();
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
  await bobsRow.getByRole("button", { name: "Message Alice" }).hover();
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

  // Another emoji from the full set.
  await bobsRow.getByRole("button", { name: "Message Alice" }).hover();
  await bobsRow.getByRole("button", { name: "Add reaction" }).first().click();
  await bob.getByRole("button", { name: "React with 🔥" }).click();
  await expect(alicesRow.getByRole("img", { name: "🔥 1: Bob" })).toBeVisible();

  // The history carries them, so somebody who arrives later sees them too, and can join in.
  await enterRoom(carol, LOUNGE.name, "Carol");
  const carolsRow = carol.getByRole("listitem").filter({ hasText: text });
  await carolsRow.getByRole("button", { name: "👍 1: Bob" }).click();
  await expect(
    alicesRow.getByRole("img", { name: "👍 2: Bob, Carol" }),
  ).toBeVisible();

  // Taking one back removes it for everybody.
  await bob.getByRole("button", { name: "🔥 1: Bob" }).click();
  await expect(alicesRow.getByRole("img", { name: "🔥 1: Bob" })).toHaveCount(
    0,
  );
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
  await alice.getByRole("button", { name: "Menu" }).click();
  await alice.getByRole("menuitem", { name: "How the chat works" }).click();

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
  await alice.getByRole("button", { name: "Menu" }).click();
  await alice.getByRole("menuitem", { name: "How the chat works" }).click();
  await expect(
    alice.getByText("Slow mode: one message every 3 s."),
  ).toBeVisible();
  await alice.keyboard.press("Escape");

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
    await expect(
      moderator.getByRole("button", { name: `Your profile: ${name}` }),
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
    await expect(
      moderator.getByRole("button", { name: `Your profile: ${name}` }),
    ).toBeVisible();

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
  const write = async (page: Page, to: string, text: string) => {
    await page.getByRole("textbox", { name: `Message to ${to}` }).fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  };

  // Alice finds Bob in the room and writes to him; the room itself hears nothing.
  await expect(
    people(alice).getByRole("button", { name: "Bob" }),
  ).toBeVisible();
  await people(alice).getByRole("button", { name: "Bob" }).click();
  await write(alice, "Bob", "psst, Bob");
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
  await write(bob, "Alice", "hi Alice");
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
    alice.getByRole("button", { name: "Your profile: Alice" }),
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
    alice.getByRole("button", { name: "Your profile: Alice" }),
  ).toBeVisible();

  // Somebody who opens the address with nothing saved is asked who they are.
  const bob = await newGuest(browser);
  await bob.goto(`/rooms/${LOUNGE.slug}`);
  await expect(bob.getByRole("textbox", { name: "Nickname" })).toBeVisible();
});

test("a guest's chosen avatar is shown to others, and a conversation says when the other person leaves and returns", async ({
  browser,
}) => {
  const alice = await newGuest(browser);
  const bob = await newGuest(browser);
  await bob.goto("/");
  await bob.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
  await bob.getByRole("radio", { name: "Female" }).check({ force: true });
  await bob.getByRole("textbox", { name: "Nickname" }).fill("Bea");
  await bob.getByRole("button", { name: "Continue" }).click();
  await expect(
    bob.getByRole("button", { name: "Your profile: Bea" }),
  ).toBeVisible();
  await enterRoom(alice, LOUNGE.name, "Alice");

  // Her avatar is next to what she says, and in the list of people.
  await send(bob, "hello from Bea");
  const line = alice
    .getByRole("log", { name: LOUNGE.name })
    .getByRole("listitem");
  await expect(
    line.filter({ hasText: "hello from Bea" }).getByTitle("Female"),
  ).toBeVisible();
  await expect(
    alice
      .getByRole("list", { name: "People in this room" })
      .getByRole("button", { name: "Bea" })
      .getByTitle("Female"),
  ).toBeVisible();

  // A private conversation: Alice's words are on her right, Bea's on her left.
  await alice
    .getByRole("list", { name: "People in this room" })
    .getByRole("button", { name: "Bea" })
    .click();
  await alice.getByRole("textbox", { name: "Message to Bea" }).fill("hi Bea");
  await alice.getByRole("button", { name: "Send", exact: true }).click();
  const conversation = alice.getByRole("log", {
    name: "Direct message with Bea",
  });
  await expect(
    conversation.getByText("hi Bea").locator("xpath=ancestor::li"),
  ).toHaveAttribute("data-side", "right");

  // When Bea leaves the room, the conversation says so, with a time; when she returns, it says that too.
  await bob.getByRole("button", { name: "Leave room" }).click();
  await expect(conversation.getByText("Bea left the room.")).toBeVisible();
  await bob.getByRole("button", { name: `Join ${LOUNGE.name}` }).click();
  await expect(conversation.getByText("Bea rejoined the room.")).toBeVisible();
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
  const write = async (page: Page, to: string, text: string) => {
    await page.getByRole("textbox", { name: `Message to ${to}` }).fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  };

  await people(alice).getByRole("button", { name: "Bob" }).click();
  await write(alice, "Bob", "before the reload");
  await bob
    .getByRole("list", { name: "Direct messages" })
    .getByRole("button", { name: /^Alice/ })
    .click();
  await expect(conversation(bob, "Alice")).toContainText("before the reload");

  await bob.reload();

  // Bob is the same person in the same room, and is back in the conversation he had open.
  await expect(
    bob.getByRole("button", { name: "Your profile: Bob" }),
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
  await write(alice, "Bob", "after the reload");
  await expect(alice.getByRole("alert")).toHaveCount(0);
  await expect(conversation(bob, "Alice")).toContainText("after the reload");

  await write(bob, "Alice", "welcome back to me");
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
    .getByRole("button", { name: "Bob" })
    .click();
  await alice
    .getByRole("textbox", { name: "Message to Bob" })
    .fill("hello Bob");
  await alice.getByRole("button", { name: "Send", exact: true }).click();
  await bob
    .getByRole("list", { name: "Direct messages" })
    .getByRole("button", { name: /^Alice/ })
    .click();
  await expect(
    bob.getByRole("log", { name: "Direct message with Alice" }),
  ).toContainText("hello Bob");

  await alice.getByRole("button", { name: "Leave room" }).click();
  await expect(bob.getByText("Alice left the room.")).toBeVisible();
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
    await alice.getByRole("button", { name: "Menu" }).click();

    return alice.getByRole("menuitem", {
      name: "Show when people join and leave",
    });
  };
  await expect(await openSetting()).toHaveAttribute("aria-checked", "true");
  await alice.keyboard.press("Escape");

  const bob = await newGuest(browser);
  await enterRoom(bob, LOUNGE.name, "Bob");
  await expect(room).toContainText("Bob joined the room.");

  await bob.getByRole("button", { name: "Leave room" }).click();
  await expect(room).toContainText("Bob left the room.");

  await (await openSetting()).click();
  await expect(room).not.toContainText("Bob left the room.");

  // The choice belongs to the browser, so a reload keeps it.
  await alice.reload();
  await expect(
    alice.getByRole("button", { name: "Your profile: Alice" }),
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
    other.getByRole("button", { name: /^Your profile:/ }),
  ).toHaveCount(0);

  await alice.getByRole("button", { name: "Leave room" }).click();
  await other.getByRole("button", { name: "Continue" }).click();
  await expect(
    other.getByRole("button", { name: "Your profile: alice" }),
  ).toBeVisible();
});
