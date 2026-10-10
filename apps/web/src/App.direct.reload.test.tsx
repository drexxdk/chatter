import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { stubRooms, setup, joinRoom } from "./test/app";
import {
  bob,
  carol,
  ada,
  dm,
  fromMe,
  present,
  enter,
  people,
  threads,
  receive,
  pane,
  log,
} from "./test/direct";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

describe("direct messages", () => {
  describe("status messages", () => {
    const statuses = () =>
      log("Bob")
        .getAllByRole("listitem")
        .filter((item) => item.getAttribute("data-kind") === "status");

    it("says in the conversation, with the time, when the other person leaves the room", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      present(server, [carol, ada]);

      const [status] = statuses();
      expect(within(status).getByText("Bob left the room.")).toHaveClass(
        "text-sky-300",
      );
      expect(status.querySelector("time")).toHaveAttribute("datetime");
    });

    it("says so again, as a new message, when they come back", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      present(server, [carol, ada]);

      present(server, [bob, carol, ada]);

      expect(statuses().map((item) => item.textContent)).toEqual([
        expect.stringContaining("Bob left the room."),
        expect.stringContaining("Bob rejoined the room."),
      ]);
    });

    it("keeps the order of what was said and what happened", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "before" }));
      await user.click(threads().getByRole("button", { name: /^Bob/ }));
      present(server, [carol, ada]);
      present(server, [bob, carol, ada]);
      receive(server, dm({ text: "after" }));

      const lines = log("Bob")
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");

      expect(lines[0]).toContain("before");
      expect(lines[1]).toContain("left the room");
      expect(lines[2]).toContain("rejoined the room");
      expect(lines[3]).toContain("after");
    });

    it("does not repeat itself when the list of people changes for somebody else", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      present(server, [carol, ada]);
      present(server, [carol]);
      present(server, [carol, ada]);

      expect(statuses()).toHaveLength(1);
    });

    it("says nothing about people nobody has written to", async () => {
      const { server } = await enter();
      receive(server, dm());

      present(server, [bob]);
      present(server, []);

      expect(
        threads().queryByRole("button", { name: /^Carol/ }),
      ).not.toBeInTheDocument();
    });

    it("is not new activity: the conversation does not pulse for it", async () => {
      const { server } = await enter();
      receive(server, fromMe(bob));

      present(server, [carol, ada]);

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).not.toHaveAccessibleName(/unread/);
    });

    it("is not added just because the guest left the room and came back to it", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join General" }));
      await screen.findByRole("button", { name: "Your profile: Alice" });
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(statuses()).toHaveLength(0);
    });

    it("is not added just because the guest moved to another room", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join Music" }));
      await screen.findByRole("button", { name: "Your profile: Alice" });
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(statuses()).toHaveLength(0);
    });
  });

  describe("how it looks", () => {
    it("puts what others say on the left, with their avatar, and what the guest says on the right without one", async () => {
      const { user, server } = await enter();
      receive(server, dm({ text: "from Bob" }));
      receive(server, fromMe(bob, "from me"));

      await user.click(people().getByRole("button", { name: "Bob" }));

      const theirs = log("Bob").getByText("from Bob").closest("li");
      const mine = log("Bob").getByText("from me").closest("li");
      expect(theirs).toHaveAttribute("data-side", "left");
      expect(within(theirs!).getByTitle("Male")).toBeInTheDocument();
      expect(mine).toHaveAttribute("data-side", "right");
      expect(within(mine!).queryByTitle("Other")).not.toBeInTheDocument();
    });

    it("shows the other person's avatar in both lists", async () => {
      const { server } = await enter();
      receive(server, dm());

      expect(people().getByTitle("Female")).toBeInTheDocument();
      expect(threads().getByTitle("Male")).toBeInTheDocument();
    });
  });

  describe("through a reload", () => {
    const DIRECT = "chatter.direct";
    type Entered = Awaited<ReturnType<typeof enter>>;

    async function reload(before: Entered) {
      before.unmount();
      const result = setup();
      await screen.findByRole("button", { name: "Your profile: Alice" });
      present(result.server, [bob, carol, ada]);
      return result;
    }

    it("keeps the conversations, and what was said in them", async () => {
      const first = await enter();
      receive(first.server, dm({ text: "before the reload" }));
      receive(first.server, fromMe(bob, "my answer"));

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(log("Bob").getByText("before the reload")).toBeInTheDocument();
      expect(log("Bob").getByText("my answer")).toBeInTheDocument();
    });

    it("shows my own words on my side, as before", async () => {
      const first = await enter();
      receive(first.server, fromMe(bob, "my answer"));

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(log("Bob").getByText("my answer").closest("li")).toHaveAttribute(
        "data-side",
        "right",
      );
    });

    it("keeps which conversations had something new", async () => {
      const first = await enter();
      receive(first.server, dm());

      await reload(first);

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toHaveAccessibleName(/1 unread message/);
    });

    it("keeps who was blocked, and tells the new connection", async () => {
      const first = await enter();
      await first.user.click(people().getByRole("button", { name: "Bob" }));
      await first.user.click(screen.getByRole("button", { name: "Block Bob" }));
      await screen.findByRole("button", { name: "Unblock Bob" });

      const { server } = await reload(first);

      await waitFor(() =>
        expect(server.latest.emittedEvents("dm:block")).toEqual([
          { guestId: "guest-bob" },
        ]),
      );
    });

    it("does not say the other person left just because the page was reloaded", async () => {
      const first = await enter();
      receive(first.server, dm());

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(
        log("Bob").queryByText("Bob left the room."),
      ).not.toBeInTheDocument();
    });

    describe("the conversation that was open", () => {
      const SAVED_DIRECT = "chatter.direct";

      // The real server lists everybody in the room when it is joined, so the other person is there from the start.
      async function reloadWith(before: Entered, others: unknown[]) {
        before.unmount();
        const result = setup(makeFakeServer({ others }));
        await screen.findByRole("button", { name: "Your profile: Alice" });
        return result;
      }

      async function openBob() {
        const first = await enter();
        receive(first.server, dm({ text: "before the reload" }));
        await first.user.click(threads().getByRole("button", { name: /^Bob/ }));
        return first;
      }

      it("is open again when the other person is still in the room", async () => {
        const first = await openBob();

        await reloadWith(first, [bob, carol]);

        expect(pane("Bob")).toBeInTheDocument();
        expect(log("Bob").getByText("before the reload")).toBeInTheDocument();
      });

      it("is closed when the other person has left, and the room is shown instead", async () => {
        const first = await openBob();

        await reloadWith(first, [carol]);

        expect(pane("Bob")).not.toBeInTheDocument();
        expect(
          screen.getByRole("log", { name: "General" }),
        ).toBeInTheDocument();
      });

      it("is still in the list when it was closed because the other person is gone", async () => {
        const first = await openBob();

        await reloadWith(first, [carol]);

        expect(
          threads().getByRole("button", { name: /^Bob/ }),
        ).toBeInTheDocument();
      });

      it("is not opened when none was open", async () => {
        const first = await enter();
        receive(first.server, dm());

        await reloadWith(first, [bob]);

        expect(pane("Bob")).not.toBeInTheDocument();
      });

      it("is not opened again after it was closed", async () => {
        const first = await openBob();
        await first.user.click(
          screen.getByRole("button", { name: "Back to the room" }),
        );

        await reloadWith(first, [bob]);

        expect(pane("Bob")).not.toBeInTheDocument();
      });

      it("is not opened for somebody the guest has no conversation with", async () => {
        const first = await openBob();
        const saved = JSON.parse(sessionStorage.getItem(SAVED_DIRECT)!);
        saved.openGuestId = "guest-stranger";
        sessionStorage.setItem(SAVED_DIRECT, JSON.stringify(saved));

        await reloadWith(first, [bob]);

        expect(
          screen.queryByRole("heading", { name: /^Direct message with/ }),
        ).toBeNull();
      });

      it("is not kept when the room is gone", async () => {
        const first = await openBob();
        first.unmount();
        const server = makeFakeServer({ others: [bob] });
        server.acks["room:join"] = () => ({
          ok: false,
          error: "room_not_found",
        });
        const { user } = setup(server);

        await screen.findByRole("heading", { name: "Public rooms" });
        await waitFor(() => expect(server.sockets).toHaveLength(1));
        server.latest.acks["room:join"] = () => ({ ok: true });
        await user.click(screen.getByRole("button", { name: "Join Music" }));
        await screen.findByRole("button", { name: "Your profile: Alice" });

        expect(
          screen.queryByRole("heading", { name: /^Direct message with/ }),
        ).toBeNull();
      });

      it("is kept for the next reload, whoever is there", async () => {
        const first = await openBob();
        const second = await reloadWith(first, [bob]);

        await reloadWith(second, [bob]);

        expect(pane("Bob")).toBeInTheDocument();
      });
    });

    // Bob was told Alice left and came back, so Alice's own copy of the conversation says the same.
    it("says the guest left and came back, the same as the other person was told", async () => {
      const first = await enter();
      receive(first.server, dm({ text: "before" }));

      const { user } = await reload(first);
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      const lines = log("Bob")
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");
      expect(lines[0]).toContain("before");
      expect(lines.filter((line) => line.includes("Alice"))).toEqual([
        expect.stringContaining("Alice left the room."),
        expect.stringContaining("Alice rejoined the room."),
      ]);
    });

    it("says it in every conversation", async () => {
      const first = await enter();
      receive(first.server, dm({ text: "from Bob" }));
      receive(
        first.server,
        dm({
          text: "from Carol",
          fromGuestId: carol.guestId,
          fromNickname: "Carol",
          fromAvatar: carol.avatar,
        }),
      );

      const { user } = await reload(first);

      for (const name of ["Bob", "Carol"]) {
        await user.click(
          threads().getByRole("button", { name: new RegExp(`^${name}`) }),
        );
        expect(
          log(name).getByText("Alice rejoined the room."),
        ).toBeInTheDocument();
        await user.click(
          screen.getByRole("button", { name: "Back to the room" }),
        );
      }
    });

    it("keeps saying it after another reload", async () => {
      const first = await enter();
      receive(first.server, dm());

      const second = await reload(first);
      await waitFor(() =>
        expect(sessionStorage.getItem(DIRECT)).toContain("rejoined"),
      );
      const { user } = await reload(second);
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(log("Bob").getAllByText("Alice rejoined the room.")).toHaveLength(
        2,
      );
    });

    it("says nothing when the server did not give the same guest back", async () => {
      const first = await enter();
      receive(first.server, dm());
      first.unmount();
      // The identity the server is asked for is one it does not know.
      const saved = JSON.parse(sessionStorage.getItem("chatter.session")!);
      saved.resume.guestId = "guest-old";
      sessionStorage.setItem("chatter.session", JSON.stringify(saved));

      const { user } = setup(makeFakeServer({ refuseResume: true }));
      await screen.findByRole("button", { name: "Your profile: Alice" });
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(
        log("Bob").queryByText("Alice rejoined the room."),
      ).not.toBeInTheDocument();
    });

    it("forgets them when the connection ends for good", async () => {
      const first = await enter();
      receive(first.server, dm());
      await waitFor(() =>
        expect(sessionStorage.getItem(DIRECT)).not.toBeNull(),
      );

      act(() => {
        first.server.latest.serverEmit("kicked", { reason: "banned" });
        first.server.latest.serverEmit("disconnect", "io server disconnect");
      });

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(sessionStorage.getItem(DIRECT)).toBeNull();
    });

    it("copes with saved conversations that are not what it expects", async () => {
      sessionStorage.setItem(
        "chatter.session",
        JSON.stringify({ nickname: "Alice" }),
      );
      sessionStorage.setItem(DIRECT, "{not json");
      window.history.replaceState(null, "", "/rooms/general");

      setup();

      await screen.findByRole("button", { name: "Your profile: Alice" });
      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });

    it("drops the broken ones and keeps the good", async () => {
      const good = {
        guestId: "guest-bob",
        nickname: "Bob",
        role: "guest",
        avatar: "male",
        unread: 0,
        present: true,
        entries: [
          { ...dm({ text: "still here" }), id: "ok-1" },
          { id: 5, text: "broken" },
        ],
      };
      sessionStorage.setItem(
        "chatter.session",
        JSON.stringify({ nickname: "Alice" }),
      );
      sessionStorage.setItem(
        DIRECT,
        JSON.stringify({
          threads: [good, { nickname: "No id" }, "nonsense", null],
          blockedIds: ["guest-x", 3],
        }),
      );
      window.history.replaceState(null, "", "/rooms/general");

      const { user } = setup();
      await screen.findByRole("button", { name: "Your profile: Alice" });
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      expect(log("Bob").getByText("still here")).toBeInTheDocument();
      expect(log("Bob").queryByText("broken")).not.toBeInTheDocument();
      expect(threads().getAllByRole("listitem")).toHaveLength(1);
    });
  });

  describe("moving around", () => {
    it("keeps the conversations when the guest goes to another room", async () => {
      const { user, server } = await enter();
      receive(server, dm());

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join Music" }));
      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(
        threads().getByRole("button", { name: /^Bob/ }),
      ).toBeInTheDocument();
    });

    it("closes an open conversation when the guest leaves the room", async () => {
      const { user, server } = await enter();
      receive(server, dm());
      await user.click(threads().getByRole("button", { name: /^Bob/ }));

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await user.click(screen.getByRole("button", { name: "Join Music" }));
      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(pane("Bob")).not.toBeInTheDocument();
    });

    it("forgets them all when the connection is given up", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [150, 150]);
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      present(server, [bob]);
      receive(server, dm());

      act(() => server.latest.serverEmit("disconnect", "transport close"));
      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
    });
  });
});
