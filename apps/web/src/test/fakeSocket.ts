import { vi } from "vitest";
import { ageFromBirthDate } from "../profile";
import { isRecord } from "../isRecord";

import type { ChatSocket, CreateSocket } from "../chat/socket";

type Handler = (...args: any[]) => void;
type AckResponder = (payload: any) => unknown;

// Stands in for the Socket.IO client and replays the chat-server protocol documented in apps/chat-server/README.md.
export class FakeSocket implements ChatSocket {
  private static events = 0;
  private handlers = new Map<string, Handler[]>();
  private pendingJoinEvents: { event: string; args: unknown[] }[] | null = null;
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;
  // Who else is in the room when this connection joins it.
  others: unknown[] = [];
  onlineMembers = new Map<string, unknown>();

  // Override per test to simulate server-side rejections.
  acks: Record<string, AckResponder> = {
    "room:join": () => ({ ok: true }),
    "room:queue:join": (payload) => this.acks["room:join"](payload),
    "room:leave": () => ({ ok: true }),
    "admin:queue:settings": (payload) => {
      this.serverEmit("admin:queue:state", payload);
      return { ok: true };
    },
    "message:send": () => ({ ok: true }),
    "reaction:toggle": () => ({ ok: true }),
    "announce:send": () => ({ ok: true }),
    "dm:send": () => ({ ok: true }),
    "dm:watch": ({ guestIds }: { guestIds: string[] }) => {
      this.serverEmit("dm:presence", {
        guestIds,
        members: guestIds.flatMap((id) => {
          const member = this.onlineMembers.get(id);
          return member ? [member] : [];
        }),
      });
      return { ok: true };
    },
    "dm:react": () => ({ ok: true }),
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
      if ("birthDate" in changes) {
        if (changes.birthDate === null) {
          delete this.profile.birthDate;
          delete this.profile.age;
        } else this.profile.age = ageFromBirthDate(changes.birthDate);
      }

      return { ok: true, profile: this.profile };
    },
  };

  // Who the real server would say this guest is.
  profile: Record<string, unknown>;
  // A token starting with "member-" is an account's, one starting with "admin-" an admin's; any other is a moderator's.
  readonly role: "guest" | "member" | "moderator";
  readonly admin: boolean;

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
    // The picture the guest chose when connecting.
    readonly picture?: string,
    readonly birthDate?: string,
  ) {
    this.admin = token?.startsWith("admin-") ?? false;
    this.role = !token
      ? "guest"
      : token.startsWith("member-")
        ? "member"
        : "moderator";
    this.profile = {
      nickname,
      avatar: token ? "other" : avatar,
      ...(picture && !token ? { picture } : {}),
      ...(age === undefined ? {} : { age }),
      ...(birthDate === undefined
        ? {}
        : { birthDate, age: ageFromBirthDate(birthDate) }),
    };
    queueMicrotask(() => {
      if (handshakeError)
        this.serverEmit("connect_error", new Error(handshakeError));
      else {
        this.serverEmit("session", {
          guestId: this.guestId,
          nickname,
          role: this.role,
          avatar: token ? "other" : avatar,
          ...(picture && !token ? { picture } : {}),
          ...(age === undefined ? {} : { age }),
          ...(birthDate === undefined
            ? {}
            : { birthDate, age: ageFromBirthDate(birthDate) }),
          ...(this.admin
            ? {
                admin: true,
                adminRooms: [
                  {
                    id: -1,
                    name: "Test lab",
                    slug: "admin-lab",
                    maxMembers: 10,
                  },
                ],
              }
            : {}),
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
      const joining = event === "room:join" || event === "room:queue:join";
      if (joining) this.pendingJoinEvents = [];
      const response: { ok?: boolean; queued?: boolean } = this.acks[event]?.(
        payload,
      ) ?? {
        ok: true,
      };
      const pending = this.pendingJoinEvents ?? [];
      this.pendingJoinEvents = null;
      if (joining && response.ok && !response.queued)
        this.serverEmit("room:joining", {
          roomSlug: (payload as { slug: string }).slug,
        });
      for (const { event, args } of pending) this.serverEmit(event, ...args);

      // The real server broadcasts presence before it acknowledges a successful join.
      if (joining && response.ok && !response.queued) {
        this.serverEmit("room:presence", {
          roomSlug: (payload as { slug: string }).slug,
          members: [
            {
              guestId: this.guestId,
              nickname: this.profile.nickname,
              role: this.role,
              avatar: this.token ? "other" : this.profile.avatar,
              ...(this.profile.picture
                ? { picture: this.profile.picture }
                : {}),
              ...(this.profile.age === undefined
                ? {}
                : { age: this.profile.age }),
            },
            ...this.others,
          ],
        });
        // And then tells the room, the guest too, that they came in.
        this.serverEmit("room:event", {
          id: `joined-${this.guestId}-${++FakeSocket.events}`,
          roomSlug: (payload as { slug: string }).slug,
          event: "joined",
          guestId: this.guestId,
          nickname: this.profile.nickname,
          sentAt: new Date().toISOString(),
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
    if (this.pendingJoinEvents) {
      this.pendingJoinEvents.push({ event, args });
      return;
    }
    const presence = args[0];
    if (
      (event === "room:presence" || event === "dm:presence") &&
      isRecord(presence)
    ) {
      if (event === "dm:presence" && Array.isArray(presence.guestIds)) {
        for (const id of presence.guestIds) {
          if (typeof id === "string") this.onlineMembers.delete(id);
        }
      }
      if (Array.isArray(presence.members)) {
        for (const member of presence.members) {
          if (isRecord(member) && typeof member.guestId === "string") {
            this.onlineMembers.set(member.guestId, member);
          }
        }
      }
    }
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
  const lobby = new FakeSocket("Lobby");
  const createLobbySocket = vi.fn(() => lobby);
  // Applied to every socket created, e.g. { "room:join": () => ({ ok: false, error: "room_full" }) }.
  const acks: Record<string, AckResponder> = {};
  // Handshake errors for the next connection attempts, consumed in order (e.g. to fail reconnects).
  const upcomingHandshakeErrors: string[] = [];

  const createSocket = vi.fn<CreateSocket>(
    (nickname, token, avatar, resume, age, picture, birthDate) => {
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
        picture,
        birthDate,
      );
      Object.assign(socket.acks, acks);
      socket.others = options.others ?? [];
      sockets.push(socket);
      return socket;
    },
  );

  return {
    lobby,
    createLobbySocket,
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
