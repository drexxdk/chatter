import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  stubRooms,
  setup,
  joinRoom,
  message,
  at,
  anyPicture,
} from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

describe("who comes and goes", () => {
  const ME = { guestId: "guest-me", nickname: "Alice" };
  const BOB = { guestId: "guest-bob", nickname: "Bob" };
  const CAROL = { guestId: "guest-carol", nickname: "Carol" };
  const KEY = "chatter.showMovements";

  const roomLog = () => within(screen.getByRole("log", { name: "General" }));
  // The setting is an item of the burger menu, which closes when it is used.
  const toggleItem = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Menu" }));

    return screen.findByRole("menuitem", {
      name: "Show when people join and leave",
    });
  };
  const present = (
    server: ReturnType<typeof makeFakeServer>,
    members: { guestId: string; nickname: string }[],
    roomSlug = "general",
  ) =>
    act(() => server.latest.serverEmit("room:presence", { roomSlug, members }));
  // What the server tells the room when somebody comes in or goes out. `at` is when, for what the history holds.
  const movement = (
    event: "joined" | "left",
    who: { guestId: string; nickname: string },
    extra: { id?: string; roomSlug?: string; sentAt?: string } = {},
  ) => ({
    id: extra.id ?? `${event}-${who.guestId}-${Math.random()}`,
    roomSlug: extra.roomSlug ?? "general",
    event,
    guestId: who.guestId,
    nickname: who.nickname,
    sentAt: extra.sentAt ?? new Date().toISOString(),
  });
  const came = (
    server: ReturnType<typeof makeFakeServer>,
    who: { guestId: string; nickname: string },
    extra: { id?: string; roomSlug?: string } = {},
  ) =>
    act(() =>
      server.latest.serverEmit("room:event", movement("joined", who, extra)),
    );
  const went = (
    server: ReturnType<typeof makeFakeServer>,
    who: { guestId: string; nickname: string },
    extra: { id?: string; roomSlug?: string } = {},
  ) =>
    act(() =>
      server.latest.serverEmit("room:event", movement("left", who, extra)),
    );
  const said = (server: ReturnType<typeof makeFakeServer>, text: string) =>
    act(() => server.latest.serverEmit("message:new", message({ text })));

  async function enter(members = [ME, BOB], history: unknown[] = []) {
    const server = makeFakeServer({
      others: members.filter((member) => member.guestId !== ME.guestId),
    });
    const result = setup(server);
    // What the server hands over with the join.
    server.acks["room:join"] = () => ({ ok: true, history });
    await joinRoom(result.user);
    await screen.findByRole("button", { name: "Your profile: Alice" });
    return result;
  }

  // The guest's own arrival is there in every room, so it is left out unless a test is about it.
  const others = /^(?!You ).*(joined|left) the room/;
  const lines = () =>
    roomLog()
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "")
      .filter(
        (text) =>
          !text.startsWith("You joined the room.") &&
          !text.startsWith("No messages yet."),
      );

  it("tells the guest, with the time, that they came into the room", async () => {
    await enter();

    const item = roomLog().getByText("You joined the room.").closest("li")!;
    expect(item).toHaveAttribute("data-kind", "status");
    expect(item.querySelector("time")).toHaveAttribute("datetime");
  });

  it("does not tell the guest again when the list of people is sent again", async () => {
    const { server } = await enter();

    present(server, [ME, BOB]);

    expect(roomLog().getAllByText("You joined the room.")).toHaveLength(1);
  });

  it("says, with the time, when somebody comes into the room", async () => {
    const { server } = await enter();

    came(server, CAROL);

    const item = roomLog().getByText("Carol joined the room.").closest("li")!;
    expect(item).toHaveAttribute("data-kind", "status");
    expect(item.querySelector("time")).toHaveAttribute("datetime");
  });

  it("says when somebody goes out of it", async () => {
    const { server } = await enter();

    went(server, BOB);

    expect(roomLog().getByText("Bob left the room.")).toBeInTheDocument();
  });

  it("says nothing about the people who were already there, or about the guest", async () => {
    await enter([ME, BOB, CAROL]);

    expect(roomLog().queryByText(others)).toBeNull();
  });

  it("says nothing about another room", async () => {
    const { server } = await enter();

    came(server, CAROL, { roomSlug: "music" });

    expect(roomLog().queryByText(others)).toBeNull();
  });

  it("says nothing when only the list of people comes", async () => {
    const { server } = await enter();

    present(server, [ME, BOB, CAROL]);

    expect(roomLog().queryByText(others)).toBeNull();
  });

  it("says it once, however many times it is told", async () => {
    const { server } = await enter();

    came(server, CAROL, { id: "same" });
    came(server, CAROL, { id: "same" });

    expect(roomLog().getAllByText("Carol joined the room.")).toHaveLength(1);
  });

  it("ignores what is not a movement", async () => {
    const { server } = await enter();

    act(() => server.latest.serverEmit("room:event", undefined));
    act(() => server.latest.serverEmit("room:event", { event: "joined" }));
    act(() =>
      server.latest.serverEmit("room:event", {
        ...movement("joined", CAROL),
        event: "danced",
      }),
    );

    expect(lines()).toEqual([]);
  });

  it("says who left and who came in the order the server did", async () => {
    const { server } = await enter();

    went(server, BOB);
    came(server, CAROL);

    expect(lines()).toEqual([
      expect.stringContaining("Bob left the room."),
      expect.stringContaining("Carol joined the room."),
    ]);
  });

  it("puts it between the messages, where it happened", async () => {
    const { server } = await enter();

    said(server, "before");
    came(server, CAROL);
    said(server, "after");

    expect(lines()).toEqual([
      expect.stringContaining("before"),
      expect.stringContaining("Carol joined the room."),
      expect.stringContaining("after"),
    ]);
  });

  it("still asks for a first message when only the movements are there", async () => {
    const { server } = await enter();

    came(server, CAROL);

    expect(screen.getByText("No messages yet. Say hello!")).toBeInTheDocument();
  });

  it("stops asking once somebody has said something", async () => {
    const { server } = await enter();

    said(server, "hello");

    expect(screen.queryByText("No messages yet. Say hello!")).toBeNull();
  });

  describe("what happened before the guest came", () => {
    const earlier = (n: number) => at(n);

    it("is there, set among the earlier messages by the time it happened", async () => {
      await enter(
        [ME],
        [
          movement("joined", BOB, { sentAt: earlier(1) }),
          message({ text: "hey", sentAt: earlier(2), guestId: BOB.guestId }),
          movement("left", BOB, { sentAt: earlier(3) }),
          message({ text: "anyone?", sentAt: earlier(4) }),
        ],
      );

      expect(lines()).toEqual([
        expect.stringContaining("Bob joined the room."),
        expect.stringContaining("hey"),
        expect.stringContaining("Bob left the room."),
        expect.stringContaining("anyone?"),
      ]);
    });

    it("comes before the guest's own arrival", async () => {
      await enter([ME], [movement("joined", CAROL, { sentAt: earlier(1) })]);

      expect(
        roomLog()
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        expect.stringContaining("Carol joined the room."),
        expect.stringContaining("You joined the room."),
        expect.stringContaining("No messages yet."),
      ]);
    });

    it("is not shown twice when it came live as well", async () => {
      const arrival = movement("joined", CAROL, { id: "once" });
      const { server } = await enter([ME], [arrival]);

      came(server, CAROL, { id: "once" });

      expect(roomLog().getAllByText("Carol joined the room.")).toHaveLength(1);
    });

    it("is shown the same to the guest who was there and the one who came after", async () => {
      const first = await enter([ME]);
      came(first.server, BOB, { id: "bob-in" });
      const live = lines().map((line) => line.split(".")[0]);
      first.unmount();
      sessionStorage.clear();
      window.history.replaceState(null, "", "/");

      await enter(
        [ME],
        [movement("joined", BOB, { id: "bob-in", sentAt: earlier(1) })],
      );

      expect(live).toEqual(["Bob joined the room"]);
      expect(lines().map((line) => line.split(".")[0])).toEqual(live);
    });

    it("says nothing about guests the history names that were banned", async () => {
      const { server } = await enter(
        [ME],
        [movement("joined", CAROL, { sentAt: earlier(1) })],
      );

      act(() =>
        server.latest.serverEmit("message:redacted", {
          roomSlug: "general",
          ids: [],
          guestIds: [CAROL.guestId],
        }),
      );

      expect(roomLog().queryByText(/Carol/)).toBeNull();
    });
  });

  it("calls the guest's own earlier visits by 'You'", async () => {
    await enter([ME], [movement("left", ME, { sentAt: at(1) })]);

    expect(roomLog().getByText("You left the room.")).toBeInTheDocument();
  });
  describe("the countdown before being disconnected for doing nothing", () => {
    const warn = (
      server: ReturnType<typeof makeFakeServer>,
      remainingMs: number,
    ) => act(() => server.latest.serverEmit("idle:warning", { remainingMs }));
    const banner = () => screen.queryByTestId("idle-warning");

    afterEach(() => {
      vi.useRealTimers();
    });

    it("is not there until the server warns", async () => {
      await enter();

      expect(banner()).toBeNull();
    });

    it("is right above the box, with the time left", async () => {
      const { server } = await enter();

      warn(server, 2 * 60_000);

      const shown = banner()!;
      expect(shown).toHaveTextContent(
        "You will be disconnected from the room unless you write something.",
      );
      expect(shown).toHaveTextContent("Time left 2:00");
      expect(shown.nextElementSibling).toBe(
        screen.getByRole("textbox", { name: "Message" }).closest("form"),
      );
    });

    it("counts down to zero and stays there", async () => {
      const { server } = await enter();
      vi.useFakeTimers();

      warn(server, 90_000);
      expect(banner()).toHaveTextContent("1:30");

      act(() => vi.advanceTimersByTime(61_000));
      expect(banner()).toHaveTextContent("0:29");

      act(() => vi.advanceTimersByTime(60_000));
      expect(banner()).toHaveTextContent("0:00");
    });

    it("is not a message in the log", async () => {
      const { server } = await enter();

      warn(server, 2 * 60_000);

      expect(roomLog().queryByText(/disconnected/)).toBeNull();
    });

    it("goes away when the server says the guest did something", async () => {
      const { server } = await enter();
      warn(server, 2 * 60_000);

      act(() => server.latest.serverEmit("idle:cleared", undefined));

      expect(banner()).toBeNull();
    });

    it("starts over from the new time when warned again", async () => {
      const { server } = await enter();
      warn(server, 30_000);
      act(() => server.latest.serverEmit("idle:cleared", undefined));

      warn(server, 2 * 60_000);

      expect(banner()).toHaveTextContent("2:00");
    });

    it("is ignored when it has nothing to say", async () => {
      const { server } = await enter();

      warn(server, 0);
      act(() => server.latest.serverEmit("idle:warning", undefined));

      expect(banner()).toBeNull();
    });
  });

  describe("the checkbox", () => {
    it("is ticked to begin with", async () => {
      const { user } = await enter();

      expect(await toggleItem(user)).toHaveAttribute("aria-checked", "true");
    });

    it("hides what was announced, and shows it again", async () => {
      const { user, server } = await enter();
      said(server, "hello all");
      came(server, CAROL);

      await user.click(await toggleItem(user));

      expect(roomLog().queryByText("Carol joined the room.")).toBeNull();
      expect(roomLog().getByText("hello all")).toBeInTheDocument();

      await user.click(await toggleItem(user));

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });

    it("keeps what happened while it was off, for when it is turned on", async () => {
      const { user, server } = await enter();
      await user.click(await toggleItem(user));

      came(server, CAROL);
      expect(roomLog().queryByText("Carol joined the room.")).toBeNull();

      await user.click(await toggleItem(user));

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });

    it("is remembered by the browser", async () => {
      const { user, unmount } = await enter();
      await user.click(await toggleItem(user));
      expect(localStorage.getItem(KEY)).toBe("false");
      unmount();
      // A new tab: the browser's choice stays, what the tab knew does not.
      sessionStorage.clear();
      window.history.replaceState(null, "", "/");

      const next = await enter();

      expect(await toggleItem(next.user)).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await next.user.keyboard("{Escape}");
      came(next.server, CAROL);
      expect(roomLog().queryByText("Carol joined the room.")).toBeNull();
    });

    it("is remembered when it is ticked again", async () => {
      const { user } = await enter();
      await user.click(await toggleItem(user));
      await user.click(await toggleItem(user));

      expect(localStorage.getItem(KEY)).toBe("true");
    });

    it("is ticked when the browser holds something else", async () => {
      localStorage.setItem(KEY, "maybe");

      const { user } = await enter();

      expect(await toggleItem(user)).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("when somebody is banned", () => {
    const banned = (
      server: ReturnType<typeof makeFakeServer>,
      guestId: string,
    ) =>
      act(() =>
        server.latest.serverEmit("message:redacted", {
          roomSlug: "general",
          ids: [],
          guestIds: [guestId],
        }),
      );

    it("takes their name out of what was announced", async () => {
      const { server } = await enter([ME, BOB]);
      came(server, CAROL);

      banned(server, CAROL.guestId);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
    });

    it("leaves what was announced about others", async () => {
      const { server } = await enter([ME, BOB]);
      came(server, CAROL);

      banned(server, CAROL.guestId);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
      went(server, BOB);
      expect(roomLog().getByText("Bob left the room.")).toBeInTheDocument();
    });

    it("says nothing about them going, which is what happens next", async () => {
      const { server } = await enter([ME, BOB, CAROL]);

      banned(server, CAROL.guestId);
      went(server, CAROL);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
    });

    it("ignores an empty id in the notice", async () => {
      const { server } = await enter([ME, BOB]);
      came(server, CAROL);

      banned(server, "");

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });
  });

  it("starts afresh in another room", async () => {
    const { user, server } = await enter();
    came(server, CAROL);

    await user.click(screen.getByRole("button", { name: "Leave room" }));
    await screen.findByRole("heading", { name: "Public rooms" });
    await user.click(screen.getByRole("button", { name: "Join Music" }));
    await screen.findByRole("button", { name: "Your profile: Alice" });

    expect(screen.queryByText("Carol joined the room.")).toBeNull();
  });
});

describe("avatars", () => {
  const SAVED = "chatter.session";

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    return within(
      await screen.findByRole("group", { name: "Gender (optional)" }),
    );
  }

  async function submitAs(
    user: ReturnType<typeof userEvent.setup>,
    avatar?: string,
  ) {
    const group = await openDialog(user);
    if (avatar) await user.click(group.getByRole("radio", { name: avatar }));
    await user.type(screen.getByLabelText("Nickname"), "Alice");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Your profile: Alice" });
  }

  describe("choosing a picture", () => {
    const pictures = () =>
      screen.getAllByRole("radio", {
        name: /^Avatar \d$/,
      }) as HTMLInputElement[];

    it("is offered with one picked at random already, so a picture is always chosen", async () => {
      const { user } = setup();
      await openDialog(user);

      expect(pictures()).toHaveLength(8);
      expect(pictures().filter((option) => option.checked)).toHaveLength(1);
    });

    it("joins with the one that was chosen, shows it in the header, and keeps it for a reload", async () => {
      const { user, server } = setup();
      await openDialog(user);
      await user.click(screen.getByRole("radio", { name: "Avatar 3" }));
      const chosen = (
        screen.getByRole("radio", { name: "Avatar 3" }) as HTMLInputElement
      ).value;
      await user.type(screen.getByLabelText("Nickname"), "Alice");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      const profile = await screen.findByRole("button", {
        name: "Your profile: Alice",
      });

      expect(server.createSocket.mock.calls[0]?.[5]).toBe(chosen);
      expect(
        profile.querySelector(`[data-picture='${chosen}']`),
      ).not.toBeNull();
      expect(JSON.parse(sessionStorage.getItem(SAVED) ?? "null")).toMatchObject(
        { picture: chosen },
      );
    });

    it("can be changed from the profile, and the server is told", async () => {
      const { user, server } = setup();
      await submitAs(user);

      await user.click(
        screen.getByRole("button", { name: "Your profile: Alice" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Edit profile" }),
      );
      await user.click(await screen.findByRole("radio", { name: "Avatar 4" }));
      const chosen = (
        screen.getByRole("radio", { name: "Avatar 4" }) as HTMLInputElement
      ).value;
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(server.latest.emittedEvents("profile:update")).toEqual([
          { picture: chosen },
        ]),
      );
    });
  });

  describe("choosing one", () => {
    it("offers four, with the plain one chosen unless the guest says otherwise", async () => {
      const { user } = setup();

      const group = await openDialog(user);

      expect(group.getAllByRole("radio")).toHaveLength(4);
      for (const name of ["Male", "Female", "Transgender"]) {
        expect(group.getByRole("radio", { name })).not.toBeChecked();
      }
      expect(group.getByRole("radio", { name: "Not specified" })).toBeChecked();
    });

    it("joins with the avatar that was chosen", async () => {
      const { user, server } = setup();

      await submitAs(user, "Female");

      expect(server.createSocket).toHaveBeenCalledWith(
        "Alice",
        undefined,
        "female",
        undefined,
        undefined,
        anyPicture,
      );
    });

    it("sends nothing extra when the guest keeps the plain one", async () => {
      const { user, server } = setup();

      await submitAs(user);

      expect(server.createSocket).toHaveBeenCalledWith(
        "Alice",
        undefined,
        undefined,
        undefined,
        undefined,
        anyPicture,
      );
    });

    it("is not offered to a moderator, whose name and look come from their account", async () => {
      const { user } = setup();
      await openDialog(user);

      await user.click(
        screen.getByRole("button", { name: "Sign in as moderator" }),
      );

      expect(
        screen.queryByRole("group", { name: "Gender (optional)" }),
      ).not.toBeInTheDocument();
    });

    it("is kept for a reload, along with the nickname", async () => {
      const first = setup();
      await submitAs(first.user, "Transgender");
      first.unmount();

      const { server } = setup();

      await screen.findByRole("button", { name: "Your profile: Alice" });
      expect(server.createSocket).toHaveBeenCalledWith(
        "Alice",
        undefined,
        "trans",
        { guestId: "guest-me", secret: "secret-1" },
        undefined,
        anyPicture,
      );
    });

    it("is dropped from a saved session when it is not one we know", async () => {
      sessionStorage.setItem(
        SAVED,
        JSON.stringify({ nickname: "Alice", avatar: "robot" }),
      );
      window.history.replaceState(null, "", "/rooms/general");
      const { server } = setup();

      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(server.createSocket).toHaveBeenCalledWith("Alice");
    });
  });

  describe("seeing them", () => {
    const log = () => within(screen.getByRole("log"));

    async function enterWith(live: unknown[]) {
      const server = makeFakeServer();
      server.acks["room:join"] = () => {
        live.forEach((m) => server.latest.serverEmit("message:new", m));
        return { ok: true, history: [] };
      };
      const result = setup(server);
      await joinRoom(result.user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      return result;
    }

    it.each([
      ["Male", "male", "lucide-mars"],
      ["Female", "female", "lucide-venus"],
      ["Transgender", "trans", "lucide-transgender"],
    ])(
      "shows %s with its own symbol next to what somebody says",
      async (title, avatar, icon) => {
        await enterWith([message({ avatar })]);

        expect(log().getByTitle(title).querySelector("svg")).toHaveClass(icon);
      },
    );

    it("shows the plain avatar for somebody who did not choose, or whose avatar is not one we know", async () => {
      await enterWith([
        message({ id: "a", text: "one" }),
        message({
          id: "b",
          text: "two",
          guestId: "guest-carol",
          nickname: "Carol",
          avatar: "robot",
        }),
      ]);

      expect(log().getAllByTitle("Not specified")).toHaveLength(2);
    });

    it("shows an account's picture where a guest has the symbol, with the symbol beside the name", async () => {
      await enterWith([
        message({
          avatar: "female",
          picture: "lorelei:abc12345",
          text: "from an account",
        }),
      ]);

      const row = screen.getByText("from an account").closest("li");

      expect(
        row?.querySelector("[data-picture='lorelei:abc12345']"),
      ).not.toBeNull();
      expect(row?.querySelector("img")).toHaveAttribute(
        "src",
        expect.stringContaining("lorelei"),
      );
      // The symbol is by the name now, not in the avatar's place.
      expect(row?.querySelector("[data-avatar]")).toBeNull();
      expect(within(row as HTMLElement).getByTitle("Female")).toHaveAttribute(
        "data-gender",
        "female",
      );
    });

    it("has no symbol beside the name of an account that did not say, and ignores a picture it does not know", async () => {
      await enterWith([
        message({
          id: "a",
          avatar: "other",
          picture: "lorelei:abc12345",
          text: "plain account",
        }),
        message({
          id: "b",
          guestId: "guest-carol",
          nickname: "Carol",
          avatar: "male",
          picture: "robot:abc12345",
          text: "odd picture",
        }),
      ]);

      const plain = screen.getByText("plain account").closest("li");
      const odd = screen.getByText("odd picture").closest("li");

      expect(plain?.querySelector("[data-gender]")).toBeNull();
      expect(odd?.querySelector("[data-picture]")).toBeNull();
      expect(within(odd as HTMLElement).getByTitle("Male")).toBeInTheDocument();
    });

    it("shows the picture of everybody who has one in the list of people", async () => {
      const { server } = await enterWith([]);

      act(() =>
        server.latest.serverEmit("room:presence", {
          roomSlug: "general",
          members: [
            { guestId: "guest-me", nickname: "Alice", avatar: "female" },
            {
              guestId: "guest-bob",
              nickname: "Bob",
              avatar: "male",
              picture: "critters:zz99zz99",
            },
          ],
        }),
      );

      const people = screen.getByRole("list", { name: "People in this room" });

      expect(
        people.querySelector("[data-picture='critters:zz99zz99']"),
      ).not.toBeNull();
      expect(within(people).getByTitle("Female")).toBeInTheDocument();
    });

    it("does not show an avatar next to the guest's own messages", async () => {
      await enterWith([
        message({
          guestId: "guest-me",
          nickname: "Alice",
          avatar: "male",
          text: "mine",
        }),
      ]);

      expect(log().queryByTitle("Male")).not.toBeInTheDocument();
    });

    it("shows everybody's avatar in the list of people, the guest's own included", async () => {
      const { server } = await enterWith([]);

      act(() =>
        server.latest.serverEmit("room:presence", {
          roomSlug: "general",
          members: [
            { guestId: "guest-me", nickname: "Alice", avatar: "female" },
            { guestId: "guest-bob", nickname: "Bob", avatar: "trans" },
          ],
        }),
      );

      const people = within(
        screen.getByRole("list", { name: "People in this room" }),
      );
      expect(people.getByTitle("Female")).toBeInTheDocument();
      expect(people.getByTitle("Transgender")).toBeInTheDocument();
    });
  });

  describe("bubbles in the room", () => {
    const side = (text: string) =>
      screen.getByText(text).closest("li")?.getAttribute("data-side");

    it("puts what others say on the left and what the guest says on the right", async () => {
      const server = makeFakeServer();
      server.acks["room:join"] = () => {
        server.latest.serverEmit("message:new", message({ text: "theirs" }));
        server.latest.serverEmit(
          "message:new",
          message({ guestId: "guest-me", nickname: "Alice", text: "mine" }),
        );
        return { ok: true, history: [] };
      };
      const { user } = setup(server);
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(side("theirs")).toBe("left");
      expect(side("mine")).toBe("right");
    });
  });
});
