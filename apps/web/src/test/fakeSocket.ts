import { vi } from "vitest";

import type { ChatSocket, CreateSocket } from "../chat/socket";

type Handler = (...args: any[]) => void;
type AckResponder = (payload: any) => unknown;

// Stands in for the Socket.IO client and replays the chat-server protocol documented in apps/chat-server/README.md.
export class FakeSocket implements ChatSocket {
  private handlers = new Map<string, Handler[]>();
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;

  // Override per test to simulate server-side rejections.
  acks: Record<string, AckResponder> = {
    "room:join": () => ({ ok: true }),
    "room:leave": () => ({ ok: true }),
    "message:send": () => ({ ok: true }),
    "announce:send": () => ({ ok: true }),
  };

  constructor(
    readonly nickname: string,
    handshakeError?: string,
    // The real server issues a new guest id on every connection.
    readonly guestId = "guest-me",
    // Present when a moderator signed in; the real server then reports the moderator role.
    readonly token?: string,
    // What the real server sends right behind the session when an announcement is still current.
    waitingAnnouncement?: unknown,
  ) {
    queueMicrotask(() => {
      if (handshakeError)
        this.serverEmit("connect_error", new Error(handshakeError));
      else {
        this.serverEmit("session", {
          guestId: this.guestId,
          nickname,
          role: token ? "moderator" : "guest",
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
              nickname: this.nickname,
              role: this.token ? "moderator" : "guest",
            },
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
  options: { handshakeError?: string; waitingAnnouncement?: unknown } = {},
) {
  const sockets: FakeSocket[] = [];
  // Applied to every socket created, e.g. { "room:join": () => ({ ok: false, error: "room_full" }) }.
  const acks: Record<string, AckResponder> = {};
  // Handshake errors for the next connection attempts, consumed in order (e.g. to fail reconnects).
  const upcomingHandshakeErrors: string[] = [];

  const createSocket = vi.fn<CreateSocket>((nickname, token) => {
    const guestId =
      sockets.length === 0 ? "guest-me" : `guest-me-${sockets.length + 1}`;
    const socket = new FakeSocket(
      nickname,
      upcomingHandshakeErrors.shift() ?? options.handshakeError,
      guestId,
      token,
      options.waitingAnnouncement,
    );
    Object.assign(socket.acks, acks);
    sockets.push(socket);
    return socket;
  });

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
