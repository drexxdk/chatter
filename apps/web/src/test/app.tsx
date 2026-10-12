import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { vi } from "vitest";

import { App } from "../App";
import { makeFakeServer } from "./fakeSocket";

export const ROOMS = [
  {
    id: 1,
    name: "General",
    slug: "general",
    maxMembers: 100,
    description: "Open chat",
    memberCount: 3,
  },
  {
    id: 2,
    name: "Music",
    slug: "music",
    maxMembers: 30,
    description: null,
    memberCount: 0,
  },
  // Payload sends null when a room's limit field is left empty.
  {
    id: 3,
    name: "Lounge",
    slug: "lounge",
    maxMembers: null,
    description: null,
  },
];

export function stubRooms(
  response: () => Promise<unknown> = async () => ({
    ok: true,
    json: async () => ROOMS,
  }),
) {
  const fetchMock = vi.fn(response);
  // The terms are not what these tests are about: they are not there, and the rooms' mock counts the rooms' requests only.
  vi.stubGlobal("fetch", (url: string) =>
    String(url).endsWith("/legal")
      ? Promise.resolve({ ok: false, status: 404 })
      : fetchMock(),
  );
  return fetchMock;
}

export function setup(server = makeFakeServer(), reconnectDelaysMs?: number[]) {
  const user = userEvent.setup();
  const { unmount } = render(
    <App
      createSocket={server.createSocket}
      reconnectDelaysMs={reconnectDelaysMs}
    />,
  );
  return { user, server, unmount };
}

export async function joinRoom(
  user: ReturnType<typeof userEvent.setup>,
  roomName = "General",
  nickname = "Alice",
) {
  await user.click(
    await screen.findByRole("button", { name: `Join ${roomName}` }),
  );
  await user.type(await screen.findByLabelText("Nickname"), nickname);
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

// A fixed clock for messages whose order matters.
export const at = (second: number) =>
  new Date(Date.UTC(2026, 9, 3, 12, 0, second)).toISOString();

export function message(overrides: Partial<Record<string, string>> = {}) {
  return {
    id: crypto.randomUUID(),
    roomSlug: "general",
    guestId: "guest-bob",
    nickname: "Bob",
    text: "hello there",
    sentAt: new Date().toISOString(),
    ...overrides,
  };
}

// The message box is an editor; these reach it to set up what a test needs, where typing would not do (a cursor or a
// selection somewhere, or a long text at once). Positions are in the words, not in the document.
export const editorOf = (box: HTMLElement) =>
  (box as unknown as { editor: Editor }).editor;

export function selectText(box: HTMLElement, from: number, to = from) {
  act(() => {
    editorOf(box).commands.setTextSelection({ from: from + 1, to: to + 1 });
  });
}

export function fillBox(box: HTMLElement, text: string) {
  act(() => {
    editorOf(box).commands.insertContent(text);
  });
}
