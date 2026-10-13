import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ROOMS,
  stubRooms,
  setup,
  joinRoom,
  at,
  message,
  anyPicture,
} from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

beforeEach(() => {
  stubRooms();
});

describe("keeping your place", () => {
  const SAVED = "chatter.session";
  const path = () => window.location.pathname;
  const save = (session: Record<string, unknown>) =>
    sessionStorage.setItem(SAVED, JSON.stringify(session));
  const goTo = (to: string) => window.history.replaceState(null, "", to);

  describe("the address", () => {
    it("shows the room in the address once the guest is in it", async () => {
      const { user } = setup();

      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(path()).toBe("/rooms/general");
    });

    it("goes back to the lobby's address when the guest leaves the room", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(path()).toBe("/");
    });

    it("follows the guest to another room", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await user.click(
        await screen.findByRole("button", { name: "Join Music" }),
      );

      await waitFor(() => expect(path()).toBe("/rooms/music"));
    });

    it("does not change the address while the guest is only choosing a nickname", async () => {
      const { user } = setup();

      await user.click(
        await screen.findByRole("button", { name: "Join General" }),
      );
      await screen.findByLabelText("Nickname");

      expect(path()).toBe("/");
    });

    it("takes the guest out of the room with the browser's back button, and in again with forward", async () => {
      const { user, server } = setup();
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      act(() => window.history.back());

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(server.latest.emittedEvents("room:leave")).toHaveLength(1);

      act(() => window.history.forward());

      await screen.findByRole("heading", { name: "General", level: 2 });
      expect(server.latest.emittedEvents("room:join")).toHaveLength(2);
      expect(path()).toBe("/rooms/general");
    });
  });

  describe("the lobby", () => {
    it("still shows who the guest is in the header after they leave a room, and no login", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(
        screen.getByRole("button", { name: "Your profile: Alice" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Login" })).toBeNull();
    });

    it("opens the profile of the guest from there", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });

      await user.click(
        screen.getByRole("button", { name: "Your profile: Alice" }),
      );

      const dialog = within(
        await screen.findByRole("dialog", { name: "Your profile" }),
      );
      expect(dialog.getByText("Alice")).toBeInTheDocument();
      expect(
        dialog.getByRole("button", { name: "Edit profile" }),
      ).toBeInTheDocument();
    });

    it("connects the guest this tab already was when the page is reloaded there, without joining a room", async () => {
      save({ nickname: "Alice", guestIds: ["guest-me"] });
      const { server } = setup();

      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(server.createSocket).toHaveBeenCalledTimes(1);
      expect(server.latest.emittedEvents("room:join")).toEqual([]);
      expect(path()).toBe("/");
      expect(
        await screen.findByRole("heading", { name: "Public rooms" }),
      ).toBeInTheDocument();
    });

    it("joins a room afterwards without asking who they are", async () => {
      save({ nickname: "Alice", guestIds: ["guest-me"] });
      const { user, server } = setup();
      await screen.findByRole("button", { name: "Your profile: Alice" });

      await user.click(
        await screen.findByRole("button", { name: "Join Music" }),
      );

      await waitFor(() =>
        expect(server.latest.emittedEvents("room:join")).toEqual([
          { slug: "music" },
        ]),
      );
      expect(screen.queryByLabelText("Nickname")).toBeNull();
      expect(server.createSocket).toHaveBeenCalledTimes(1);
    });

    it("connects only once the rooms have been asked for, so that the page's first moments do not cut the connection off", async () => {
      save({ nickname: "Alice", guestIds: ["guest-me"] });
      let release: () => void = () => {};
      stubRooms(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ ok: true, json: async () => ROOMS });
          }),
      );
      const { server } = setup();

      expect(server.createSocket).not.toHaveBeenCalled();
      release();

      await screen.findByRole("button", { name: "Your profile: Alice" });
      expect(server.createSocket).toHaveBeenCalledTimes(1);
    });

    it("is a plain lobby when nothing was saved", async () => {
      const { server } = setup();

      await screen.findByRole("heading", { name: "Public rooms" });

      expect(server.createSocket).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: /^Your profile:/ }),
      ).toBeNull();
    });
  });

  describe("opening a room's address", () => {
    it("asks for a nickname for that room when the guest has none saved", async () => {
      goTo("/rooms/music");
      setup();

      expect(await screen.findByLabelText("Nickname")).toBeInTheDocument();
      expect(path()).toBe("/rooms/music");
    });

    it("joins that room as the nickname used before in this tab", async () => {
      save({ nickname: "Alice" });
      goTo("/rooms/music");
      const { server } = setup();

      await screen.findByRole("button", { name: "Your profile: Alice" });

      expect(server.createSocket).toHaveBeenCalledWith("Alice");
      expect(server.latest.emittedEvents("room:join")).toEqual([
        { slug: "music" },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("signs a moderator back in with the saved token, without the password", async () => {
      save({ nickname: "Ada Mod", token: "signed-token" });
      goTo("/rooms/general");
      const { server } = setup();

      await screen.findByRole("button", { name: "Your profile: Ada Mod" });

      expect(server.createSocket).toHaveBeenCalledWith(
        "Ada Mod",
        "signed-token",
      );
    });

    describe("taking over the identity from before the reload", () => {
      const resume = { guestId: "guest-old", secret: "old-secret" };
      const saved = () => JSON.parse(sessionStorage.getItem(SAVED) ?? "null");

      it("presents the saved id and secret, so the server can give the same guest id back", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        const { server } = setup();

        await screen.findByRole("button", { name: "Your profile: Alice" });

        expect(server.createSocket).toHaveBeenCalledWith(
          "Alice",
          undefined,
          undefined,
          resume,
        );
        expect(server.latest.guestId).toBe("guest-old");
      });

      // Each connection is given a new secret, and only the newest one works.
      it("saves the new secret the server gave the new connection", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        setup();

        await screen.findByRole("button", { name: "Your profile: Alice" });

        expect(saved().resume).toEqual({
          guestId: "guest-old",
          secret: "secret-1",
        });
      });

      it("does not note the id it already had a second time", async () => {
        save({ nickname: "Alice", guestIds: ["guest-old"], resume });
        goTo("/rooms/general");
        setup();

        await screen.findByRole("button", { name: "Your profile: Alice" });

        expect(saved().guestIds).toEqual(["guest-old"]);
      });

      it("does not present a secret again once the server has stopped giving them", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        const server = makeFakeServer({ withoutSecret: true });
        setup(server, [5]);
        await screen.findByRole("button", { name: "Your profile: Alice" });

        act(() => server.latest.serverEmit("disconnect", "transport close"));
        await waitFor(() =>
          expect(server.createSocket).toHaveBeenCalledTimes(2),
        );

        expect(server.createSocket).toHaveBeenLastCalledWith("Alice");
      });

      it("saves the new identity when the server did not accept the old one", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        setup(makeFakeServer({ refuseResume: true }));

        await screen.findByRole("button", { name: "Your profile: Alice" });

        expect(saved().resume).toEqual({
          guestId: "guest-me",
          secret: "secret-1",
        });
        expect(saved().guestIds).toEqual(["guest-me"]);
      });

      it("also works for a moderator", async () => {
        save({ nickname: "Ada Mod", token: "signed-token", resume });
        goTo("/rooms/general");
        const { server } = setup();

        await screen.findByRole("button", { name: "Your profile: Ada Mod" });

        expect(server.createSocket).toHaveBeenCalledWith(
          "Ada Mod",
          "signed-token",
          undefined,
          resume,
        );
      });

      it.each([
        ["without a secret", { guestId: "guest-old" }],
        ["without an id", { secret: "old-secret" }],
        ["with numbers", { guestId: 1, secret: 2 }],
        ["empty", { guestId: "", secret: "" }],
      ])("does not present what was saved %s", async (_label, broken) => {
        save({ nickname: "Alice", resume: broken });
        goTo("/rooms/general");
        const { server } = setup();

        await screen.findByRole("button", { name: "Your profile: Alice" });

        expect(server.createSocket).toHaveBeenCalledWith("Alice");
      });

      it("is presented in the lobby too, so that joining a room afterwards is as the same guest", async () => {
        save({ nickname: "Alice", resume });
        const { user, server } = setup();

        await screen.findByRole("button", { name: "Your profile: Alice" });
        await user.click(
          await screen.findByRole("button", { name: "Join General" }),
        );
        await screen.findByRole("heading", { name: "General", level: 2 });

        expect(server.createSocket).toHaveBeenCalledTimes(1);
        expect(server.createSocket.mock.calls[0]).toContainEqual(resume);
      });

      it("is forgotten with everything else when the connection ends for good", async () => {
        save({ nickname: "Alice", resume });
        goTo("/rooms/general");
        const server = makeFakeServer();
        const { user } = setup(server, [60_000]);
        await screen.findByRole("button", { name: "Your profile: Alice" });

        act(() => server.latest.serverEmit("disconnect", "transport close"));
        await user.click(screen.getByRole("button", { name: "Leave room" }));
        await screen.findByRole("heading", { name: "Public rooms" });

        expect(sessionStorage.getItem(SAVED)).toBeNull();
      });
    });

    describe("after a reload", () => {
      const side = (text: string) =>
        screen.getByText(text).closest("li")?.getAttribute("data-side");
      const savedIds = () =>
        JSON.parse(sessionStorage.getItem(SAVED) ?? "null")?.guestIds;

      async function reloadWith(
        history: unknown[],
        saved: unknown = ["guest-before"],
      ) {
        save({ nickname: "Alice", guestIds: saved });
        goTo("/rooms/general");
        const server = makeFakeServer();
        server.acks["room:join"] = () => ({ ok: true, history });
        setup(server);
        await screen.findByRole("button", { name: "Your profile: Alice" });
      }

      // The server gives a guest a new id on every connection, so a reload is a new connection.
      it("still shows what the guest wrote before as theirs, on their side", async () => {
        await reloadWith([
          message({
            id: "old",
            guestId: "guest-before",
            nickname: "Alice",
            text: "from before",
            sentAt: at(1),
          }),
          message({ id: "other", text: "from Bob", sentAt: at(2) }),
        ]);

        expect(side("from before")).toBe("right");
        expect(side("from Bob")).toBe("left");
      });

      it("remembers the id of each connection for the next reload", async () => {
        const { user } = setup();

        await joinRoom(user);
        await screen.findByRole("button", { name: "Your profile: Alice" });

        expect(savedIds()).toEqual(["guest-me"]);
      });

      it("keeps the earlier ids too", async () => {
        await reloadWith([]);

        expect(savedIds()).toEqual(["guest-before", "guest-me"]);
      });

      it("keeps only the latest ids, so the saved list cannot grow without end", async () => {
        await reloadWith(
          [],
          Array.from({ length: 30 }, (_, n) => `guest-${n}`),
        );

        expect(savedIds()).toHaveLength(20);
        expect(savedIds().at(-1)).toBe("guest-me");
        expect(savedIds()[0]).toBe("guest-11");
      });

      it("ignores saved ids that are not text", async () => {
        await reloadWith([], [1, null, "guest-ok", { id: 2 }]);

        expect(savedIds()).toEqual(["guest-ok", "guest-me"]);
      });

      it("does not take what somebody else wrote for the guest's own", async () => {
        await reloadWith([
          message({ id: "x", guestId: "guest-stranger", text: "not mine" }),
        ]);

        expect(side("not mine")).toBe("left");
      });
    });

    it("carries on after a reload, as if nothing happened", async () => {
      const first = setup();
      await joinRoom(first.user);
      await screen.findByRole("button", { name: "Your profile: Alice" });
      first.unmount();

      const { server } = setup();

      await screen.findByRole("button", { name: "Your profile: Alice" });
      expect(path()).toBe("/rooms/general");
      expect(server.latest.emittedEvents("room:join")).toEqual([
        { slug: "general" },
      ]);
    });

    it("asks again, with the reason, when the saved moderator token has expired", async () => {
      save({ nickname: "Ada Mod", token: "stale" });
      goTo("/rooms/general");
      setup(makeFakeServer({ handshakeError: "invalid_token" }));

      expect(
        await within(await screen.findByRole("dialog")).findByRole("alert"),
      ).toHaveTextContent("Your session has expired");
      expect(sessionStorage.getItem(SAVED)).toBeNull();
    });

    it("does not try again with a nickname that is no longer accepted", async () => {
      save({ nickname: "Alice" });
      goTo("/rooms/general");
      const { server } = setup(makeFakeServer({ handshakeError: "banned" }));

      expect(
        await within(await screen.findByRole("dialog")).findByRole("alert"),
      ).toHaveTextContent("You are banned from this chat.");
      expect(sessionStorage.getItem(SAVED)).toBeNull();
      expect(server.createSocket).toHaveBeenCalledTimes(1);
    });

    it("shows the lobby, and a clean address, for a room that does not exist", async () => {
      goTo("/rooms/nowhere");
      setup();

      await screen.findByRole("heading", { name: "Public rooms" });

      await waitFor(() => expect(path()).toBe("/"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("waits for the rooms before deciding, and joins once they are known", async () => {
      save({ nickname: "Alice" });
      goTo("/rooms/music");
      let release: () => void = () => {};
      stubRooms(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ ok: true, json: async () => ROOMS });
          }),
      );
      const { server } = setup();

      expect(server.createSocket).not.toHaveBeenCalled();
      release();

      await screen.findByRole("button", { name: "Your profile: Alice" });
    });
  });

  describe("what is remembered", () => {
    it("remembers nothing from a nickname the server turned down", async () => {
      const { user } = setup(makeFakeServer({ handshakeError: "banned" }));

      await joinRoom(user);
      await screen.findByRole("alert");

      expect(sessionStorage.getItem(SAVED)).toBeNull();
    });

    it("remembers a moderator's token, never their email or password", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url.endsWith("/moderator/login")
            ? {
                ok: true,
                status: 200,
                json: async () => ({ token: "signed-token", name: "Ada Mod" }),
              }
            : { ok: true, json: async () => ROOMS },
        ),
      );
      const { user } = setup();
      await user.click(
        await screen.findByRole("button", { name: "Join General" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Sign in as moderator" }),
      );
      await user.type(screen.getByLabelText("Email"), "ada@example.com");
      await user.type(screen.getByLabelText("Password"), "correct horse");
      await user.click(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByRole("button", { name: "Your profile: Ada Mod" });

      const saved = sessionStorage.getItem(SAVED) ?? "";
      expect(JSON.parse(saved)).toEqual({
        nickname: "Ada Mod",
        token: "signed-token",
        guestIds: ["guest-me"],
        resume: { guestId: "guest-me", secret: "secret-1" },
      });
      expect(saved).not.toContain("correct horse");
      expect(saved).not.toContain("ada@example.com");
    });

    it("forgets it when the guest is banned out of the chat", async () => {
      const { user, server } = setup();
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      act(() => {
        server.latest.serverEmit("kicked", { reason: "banned" });
        server.latest.serverEmit("disconnect", "io server disconnect");
      });

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(sessionStorage.getItem(SAVED)).toBeNull();
    });

    it("forgets it when the guest gives up reconnecting", async () => {
      const server = makeFakeServer();
      const { user } = setup(server, [5_000, 5_000]);
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      act(() => server.latest.serverEmit("disconnect", "transport close"));
      await user.click(screen.getByRole("button", { name: "Leave room" }));

      await screen.findByRole("heading", { name: "Public rooms" });
      expect(sessionStorage.getItem(SAVED)).toBeNull();
      expect(path()).toBe("/");
    });

    it("keeps it while the guest is only out of the room", async () => {
      const { user } = setup();
      await joinRoom(user);
      await screen.findByRole("button", { name: "Your profile: Alice" });

      await user.click(screen.getByRole("button", { name: "Leave room" }));
      await screen.findByRole("heading", { name: "Public rooms" });

      expect(JSON.parse(sessionStorage.getItem(SAVED) ?? "null")).toEqual({
        nickname: "Alice",
        picture: anyPicture,
        guestIds: ["guest-me"],
        resume: { guestId: "guest-me", secret: "secret-1" },
      });
    });

    it("copes with a saved value that is not what it expects", async () => {
      sessionStorage.setItem(SAVED, "{not json");
      goTo("/rooms/general");
      const { server } = setup();

      expect(await screen.findByLabelText("Nickname")).toBeInTheDocument();
      expect(server.createSocket).not.toHaveBeenCalled();
    });
  });
});

describe("language", () => {
  it("switches the interface language and remembers the choice", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { name: "Public rooms" });

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(await screen.findByRole("menuitem", { name: /Dansk/ }));

    expect(
      await screen.findByRole("heading", { name: "Offentlige rum" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("chatter.language")).toBe("da");
    expect(document.documentElement.lang).toBe("da");
  });
});
