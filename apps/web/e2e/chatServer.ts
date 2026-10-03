import { io } from "socket.io-client";

import { CHAT_SERVER_URL } from "./constants";

// Bans reach the chat-server through its periodic cache sync, so tests wait for a ban to take effect (or lift)
// by probing the handshake instead of sleeping for a fixed time.
export function probeConnection(): Promise<"ok" | "banned" | "error"> {
  return new Promise((resolve) => {
    const socket = io(CHAT_SERVER_URL, {
      auth: { nickname: "Probe" },
      reconnection: false,
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.disconnect();
      resolve("ok");
    });
    socket.on("connect_error", (error) => {
      socket.disconnect();
      resolve(error.message === "banned" ? "banned" : "error");
    });
  });
}

export async function waitForConnectionState(
  expected: "ok" | "banned",
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await probeConnection()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Chat server never reached the "${expected}" connection state`,
  );
}

// New rooms created in Payload reach the lobby after the chat-server's next cache sync.
export async function waitForRooms(slugs: string[], timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${CHAT_SERVER_URL}/rooms`);
    const rooms = (await response.json()) as { slug: string }[];

    if (slugs.every((slug) => rooms.some((room) => room.slug === slug))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Chat server never listed the rooms: ${slugs.join(", ")}`);
}
