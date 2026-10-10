import { vi } from "vitest";

import type { ChatSocket, CreateSocket } from "../chat/socket";

type Handler = (...args: any[]) => void;
type AckResponder = (payload: any) => unknown;

// Stands in for the Socket.IO client and replays the chat-server protocol documented in apps/chat-server/README.md.
export class FakeSocket implements ChatSocket {
  private handlers = new Map<string, Handler[]>();
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;
  // Who else is in the room when this connection joins it.
  others: unknown[] = [];

  // Override per test to simulate server-side rejections.
  acks: Record<string, AckResponder> = {
    "room:join": () => ({ ok: true }),
    "room:leave": () => ({ ok: true }),
    "message:send": () => ({ ok: true }),
    "reaction:toggle": () => ({ ok: true }),
    "announce:send": () => ({ ok: true }),
    "dm:send": () => ({ ok: true }),
    "dm:block": () => ({ ok: true }),
    "dm:unblock": () => ({ ok: true }),
    // Like the real server, answers with who the guest is now.
    "profile:update": (payload) => {
      const changes = { ...(payload as Record<string, unknown>) };
      if (changes.age === null) delete changes.age;
      this.profile = { ...this.profile, ...changes };
      if ((payload as Record<string, unknown>).age === null) {
        delete this.profile.age;
      }

      return { ok: true, profile: this.profile };
    },
  };

  // Who the real server would say this guest is.
  profile: Record<string, unknown>;

  constructor(
    readonly nickname: string,
    handshakeError?: string,
    // The real server issues a new guest id on every connection.
    readonly guestId = "guest-me",
    // Present when a moderator signed in; the real server then reports the moderator role.
    readonly token?: string,
    // What the real server sends right behind the session when an announcement is still current.
    waitingAnnouncement?: unknown,
    readonly avatar: string = "other",
    // The secret the real server hands each connection for resuming its identity.
    readonly resumeSecret?: string,
    // What the guest said about their age when connecting.
    readonly age?: number,
  ) {
    this.profile = {
      nickname,
      avatar: token ? "other" : avatar,
      ...(age === undefined ? {} : { age }),
    };
    queueMicrotask(() => {
      if (handshakeError)
        this.serverEmit("connect_error", new Error(handshakeError));
      else {
        this.serverEmit("session", {
          guestId: this.guestId,
          nickname,
          role: token ? "moderator" : "guest",
          avatar: token ? "other" : avatar,
          ...(age === undefined ? {} : { age }),
          resumeSecret: this.resumeSecret,
        });
        if (waitingAnnouncement)
          this.serverEmit("announcement:new", waitingAnnouncement);
      }
    });
  }

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  emit(event: string, payload?: unknown, ack?: (response: unknown) => void) {
    this.emitted.push({ event, payload });

    if (typeof ack !== "function") return;

    queueMicrotask(() => {
      const response: { ok?: boolean } = this.acks[event]?.(payload) ?? {
        ok: true,
      };

      // The real server broadcasts presence before it acknowledges a successful join.
      if (event === "room:join" && response.ok) {
        this.serverEmit("room:presence", {
          roomSlug: (payload as { slug: string }).slug,
          members: [
            {
              guestId: this.guestId,
              nickname: this.profile.nickname,
              role: this.token ? "moderator" : "guest",
              avatar: this.token ? "other" : this.profile.avatar,
              ...(this.profile.age === undefined
                ? {}
                : { age: this.profile.age }),
            },
            ...this.others,
          ],
        });
      }

      ack(response);
    });
  }

  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.serverEmit("disconnect", "io client disconnect");
  }

  serverEmit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.forEach((handler) => handler(...args));
  }

  emittedEvents(event: string) {
    return this.emitted
      .filter((entry) => entry.event === event)
      .map((entry) => entry.payload);
  }
}

export function makeFakeServer(
  options: {
    handshakeError?: string;
    waitingAnnouncement?: unknown;
    // Gives every connection a new guest id even when it presents the old one, as a server does once the secret has run out.
    refuseResume?: boolean;
    // Who is already in a room when a connection joins it.
    others?: unknown[];
    // A server that gives no secret for resuming.
    withoutSecret?: boolean;
  } = {},
) {
  const sockets: FakeSocket[] = [];
  // Applied to every socket created, e.g. { "room:join": () => ({ ok: false, error: "room_full" }) }.
  const acks: Record<string, AckResponder> = {};
  // Handshake errors for the next connection attempts, consumed in order (e.g. to fail reconnects).
  const upcomingHandshakeErrors: string[] = [];

  const createSocket = vi.fn<CreateSocket>(
    (nickname, token, avatar, resume, age) => {
      // A real server honours a resume with the right secret; the fake always accepts it unless told otherwise.
      const guestId =
        (options.refuseResume ? undefined : resume?.guestId) ??
        (sockets.length === 0 ? "guest-me" : `guest-me-${sockets.length + 1}`);
      const socket = new FakeSocket(
        nickname,
        upcomingHandshakeErrors.shift() ?? options.handshakeError,
        guestId,
        token,
        options.waitingAnnouncement,
        avatar,
        options.withoutSecret ? undefined : `secret-${sockets.length + 1}`,
        age,
      );
      Object.assign(socket.acks, acks);
      socket.others = options.others ?? [];
      sockets.push(socket);
      return socket;
    },
  );

  return {
    acks,
    sockets,
    failNextConnections(...errors: string[]) {
      upcomingHandshakeErrors.push(...errors);
    },
    get latest() {
      return sockets[sockets.length - 1];
    },
    createSocket,
  };
}
