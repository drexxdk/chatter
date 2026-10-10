import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubRooms, setup, joinRoom, message } from "./test/app";
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
  const said = (server: ReturnType<typeof makeFakeServer>, text: string) =>
    act(() => server.latest.serverEmit("message:new", message({ text })));

  async function enter(members = [ME, BOB], leaveGraceMs = 0) {
    const result = setup(
      makeFakeServer({
        others: members.filter((member) => member.guestId !== ME.guestId),
      }),
      undefined,
      leaveGraceMs,
    );
    await joinRoom(result.user);
    await screen.findByRole("button", { name: "Your profile: Alice" });
    return result;
  }

  const lines = () =>
    roomLog()
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");

  it("says, with the time, when somebody comes into the room", async () => {
    const { server } = await enter();

    present(server, [ME, BOB, CAROL]);

    const item = roomLog().getByText("Carol joined the room.").closest("li")!;
    expect(item).toHaveAttribute("data-kind", "status");
    expect(item.querySelector("time")).toHaveAttribute("datetime");
  });

  it("says when somebody goes out of it", async () => {
    const { server } = await enter();

    present(server, [ME]);

    expect(roomLog().getByText("Bob left the room.")).toBeInTheDocument();
  });

  it("says nothing about the people who were already there, or about the guest", async () => {
    await enter([ME, BOB, CAROL]);

    expect(roomLog().queryByText(/joined the room|left the room/)).toBeNull();
  });

  it("says nothing when the list is for another room", async () => {
    const { server } = await enter();

    present(server, [CAROL], "music");

    expect(roomLog().queryByText(/joined the room|left the room/)).toBeNull();
  });

  it("says nothing when the list did not change", async () => {
    const { server } = await enter();

    present(server, [ME, BOB]);

    expect(roomLog().queryByText(/joined the room|left the room/)).toBeNull();
  });

  it("says who left and who came when both happen at once", async () => {
    const { server } = await enter();

    present(server, [ME, CAROL]);

    expect(lines()).toEqual([
      expect.stringContaining("Bob left the room."),
      expect.stringContaining("Carol joined the room."),
    ]);
  });

  it("puts it between the messages, where it happened", async () => {
    const { server } = await enter();

    said(server, "before");
    present(server, [ME, BOB, CAROL]);
    said(server, "after");

    expect(lines()).toEqual([
      expect.stringContaining("before"),
      expect.stringContaining("Carol joined the room."),
      expect.stringContaining("after"),
    ]);
  });

  it("does not count the room as empty when only the movements are there", async () => {
    const { server } = await enter();

    present(server, [ME, BOB, CAROL]);

    expect(screen.queryByText("No messages yet. Say hello!")).toBeNull();
  });

  describe("somebody who is back soon", () => {
    const GRACE = 15_000;
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    const enterWithGrace = async () => {
      const result = await enter([ME, BOB], GRACE);
      vi.useFakeTimers();
      return result;
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it("is not announced as leaving or joining", async () => {
      const { server } = await enterWithGrace();

      present(server, [ME]);
      wait(5_000);
      present(server, [ME, BOB]);
      wait(GRACE * 2);

      expect(roomLog().queryByText(/joined the room|left the room/)).toBeNull();
    });

    it("is announced as leaving once the time is up, where they left", async () => {
      const { server } = await enterWithGrace();

      said(server, "before");
      present(server, [ME]);
      said(server, "after");
      expect(roomLog().queryByText("Bob left the room.")).toBeNull();

      wait(GRACE);

      expect(lines()).toEqual([
        expect.stringContaining("before"),
        expect.stringContaining("Bob left the room."),
        expect.stringContaining("after"),
      ]);
    });

    it("is announced as joining when they come back after that", async () => {
      const { server } = await enterWithGrace();

      present(server, [ME]);
      wait(GRACE);
      present(server, [ME, BOB]);

      expect(lines()).toEqual([
        expect.stringContaining("Bob left the room."),
        expect.stringContaining("Bob joined the room."),
      ]);
    });

    it("does not hold back others", async () => {
      const { server } = await enterWithGrace();

      present(server, [ME, CAROL]);

      expect(lines()).toEqual([
        expect.stringContaining("Carol joined the room."),
      ]);
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
      present(server, [ME, BOB, CAROL]);

      await user.click(await toggleItem(user));

      expect(roomLog().queryByText("Carol joined the room.")).toBeNull();
      expect(roomLog().getByText("hello all")).toBeInTheDocument();

      await user.click(await toggleItem(user));

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });

    it("keeps what happened while it was off, for when it is turned on", async () => {
      const { user, server } = await enter();
      await user.click(await toggleItem(user));

      present(server, [ME, BOB, CAROL]);
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
      present(next.server, [ME, BOB, CAROL]);
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
      present(server, [ME, BOB, CAROL]);

      banned(server, CAROL.guestId);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
    });

    it("leaves what was announced about others", async () => {
      const { server } = await enter([ME, BOB]);
      present(server, [ME, BOB, CAROL]);

      banned(server, CAROL.guestId);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
      present(server, [ME]);
      expect(roomLog().getByText("Bob left the room.")).toBeInTheDocument();
    });

    it("says nothing about them going, which is what happens next", async () => {
      const { server } = await enter([ME, BOB, CAROL]);

      banned(server, CAROL.guestId);
      present(server, [ME, BOB]);

      expect(roomLog().queryByText(/Carol/)).toBeNull();
    });

    it("ignores an empty id in the notice", async () => {
      const { server } = await enter([ME, BOB]);
      present(server, [ME, BOB, CAROL]);

      banned(server, "");

      expect(roomLog().getByText("Carol joined the room.")).toBeInTheDocument();
    });
  });

  it("starts afresh in another room", async () => {
    const { user, server } = await enter();
    present(server, [ME, BOB, CAROL]);

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
    return within(await screen.findByRole("group", { name: "Avatar" }));
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

  describe("choosing one", () => {
    it("offers four, with the plain one chosen unless the guest says otherwise", async () => {
      const { user } = setup();

      const group = await openDialog(user);

      expect(group.getAllByRole("radio")).toHaveLength(4);
      for (const name of ["Male", "Female", "Trans"]) {
        expect(group.getByRole("radio", { name })).not.toBeChecked();
      }
      expect(group.getByRole("radio", { name: "Other" })).toBeChecked();
    });

    it("joins with the avatar that was chosen", async () => {
      const { user, server } = setup();

      await submitAs(user, "Female");

      expect(server.createSocket).toHaveBeenCalledWith(
        "Alice",
        undefined,
        "female",
      );
    });

    it("sends nothing extra when the guest keeps the plain one", async () => {
      const { user, server } = setup();

      await submitAs(user);

      expect(server.createSocket).toHaveBeenCalledWith("Alice");
    });

    it("is not offered to a moderator, whose name and look come from their account", async () => {
      const { user } = setup();
      await openDialog(user);

      await user.click(
        screen.getByRole("button", { name: "Sign in as moderator" }),
      );

      expect(
        screen.queryByRole("group", { name: "Avatar" }),
      ).not.toBeInTheDocument();
    });

    it("is kept for a reload, along with the nickname", async () => {
      const first = setup();
      await submitAs(first.user, "Trans");
      first.unmount();

      const { server } = setup();

      await screen.findByRole("button", { name: "Your profile: Alice" });
      expect(server.createSocket).toHaveBeenCalledWith(
        "Alice",
        undefined,
        "trans",
        { guestId: "guest-me", secret: "secret-1" },
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
      ["Trans", "trans", "lucide-transgender"],
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

      expect(log().getAllByTitle("Other")).toHaveLength(2);
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
      expect(people.getByTitle("Trans")).toBeInTheDocument();
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
