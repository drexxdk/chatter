import { act, screen, within } from "@testing-library/react";

import { joinRoom, setup } from "./app";
import type { makeFakeServer } from "./fakeSocket";

export const ME = "guest-me";
export const bob = {
  guestId: "guest-bob",
  nickname: "Bob",
  role: "guest",
  avatar: "male",
};
export const carol = {
  guestId: "guest-carol",
  nickname: "Carol",
  role: "guest",
  avatar: "female",
};
export const ada = {
  guestId: "guest-mod",
  nickname: "Ada Mod",
  role: "moderator",
  avatar: "other",
};

export const dm = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  fromGuestId: bob.guestId,
  fromNickname: "Bob",
  fromRole: "guest",
  fromAvatar: "male",
  toGuestId: ME,
  toNickname: "Alice",
  toAvatar: "other",
  text: "hi Alice",
  sentAt: new Date().toISOString(),
  ...overrides,
});

export const fromMe = (to: typeof bob, text = "hi back") =>
  dm({
    fromGuestId: ME,
    fromNickname: "Alice",
    fromRole: "guest",
    fromAvatar: "other",
    toGuestId: to.guestId,
    toNickname: to.nickname,
    toAvatar: to.avatar,
    text,
  });

export type Server = ReturnType<typeof makeFakeServer>;

export function present(server: Server, others: (typeof bob)[]) {
  act(() =>
    server.latest.serverEmit("room:presence", {
      roomSlug: "general",
      members: [{ guestId: ME, nickname: "Alice", role: "guest" }, ...others],
    }),
  );
}

export async function enter(others = [bob, carol, ada]) {
  const result = setup();
  await joinRoom(result.user);
  await screen.findByRole("button", { name: "Your profile: Alice" });
  present(result.server, others);
  return result;
}

export const people = () =>
  within(screen.getByRole("list", { name: "People in this room" }));
export const threads = () =>
  within(screen.getByRole("list", { name: "Direct messages" }));
export const receive = (server: Server, message: unknown) =>
  act(() => server.latest.serverEmit("dm:new", message));
export const pane = (name: string) =>
  screen.queryByRole("heading", { name: `Direct message with ${name}` });
export const log = (name: string) =>
  within(screen.getByRole("log", { name: `Direct message with ${name}` }));
