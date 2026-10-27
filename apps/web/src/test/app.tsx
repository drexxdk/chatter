import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import type { ComponentProps } from "react";
import { BrowserRouter, MemoryRouter } from "react-router";
import { expect, vi } from "vitest";

import { App as RealApp } from "../App";
import { PICTURE_PATTERN } from "../chat/picture";
import { FakeSocket, makeFakeServer } from "./fakeSocket";

const createLobbySocket = () => new FakeSocket("Lobby");

// What a guest who joined through the dialog connects with: a picture was chosen for them, at random.
export const anyPicture = expect.stringMatching(PICTURE_PATTERN);

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
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (request.method === "GET") {
        if (path === "/rooms") return fetchMock();
        if (path === "/auth/providers") return Response.json({ providers: [] });
        if (path === "/legal") return new Response(null, { status: 404 });
      }
      throw new Error(`Unexpected mocked request: ${request.method} ${path}`);
    },
  );
  return fetchMock;
}

// The app in the browser's own router, as main.tsx has it.
export function App(props: ComponentProps<typeof RealApp>) {
  return (
    <BrowserRouter>
      <RealApp createLobbySocket={createLobbySocket} {...props} />
    </BrowserRouter>
  );
}

// The app opened at an address, with its own history (nothing of the browser's).
export function renderAt(path: string, server = makeFakeServer()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RealApp
        createSocket={server.createSocket}
        createLobbySocket={server.createLobbySocket}
      />
    </MemoryRouter>,
  );
}

export function setup(server = makeFakeServer(), reconnectDelaysMs?: number[]) {
  const user = userEvent.setup();
  const { unmount } = render(
    <App
      createSocket={server.createSocket}
      createLobbySocket={server.createLobbySocket}
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
  await user.click(await screen.findByLabelText("Nickname"));
  await user.paste(nickname);
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

export async function leaveRoom(user: ReturnType<typeof userEvent.setup>) {
  const heading = document.getElementById("room-heading");
  expect(heading).not.toBeNull();
  await user.click(within(heading!).getByRole("button"));
  await user.click(screen.getByRole("menuitem", { name: "Leave room" }));
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
