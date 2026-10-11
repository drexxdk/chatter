// What the development setup consists of, shared by the scripts that start and stop it.
import net from "node:net";

export const DATABASE_PORTS = [5432, 6379];

export const SERVICES = [
  { name: "admin", port: 3000, command: "npm run dev:admin", color: "blue" },
  {
    name: "chat",
    port: 4000,
    command: "npm run dev:chat-server",
    color: "green",
  },
  { name: "web", port: 5173, command: "npm run dev:web", color: "magenta" },
];

function answers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

// Servers may listen on IPv4 or IPv6 only, depending on how they bind "localhost".
export async function listening(port) {
  const results = await Promise.all(
    ["127.0.0.1", "::1"].map((host) => answers(port, host)),
  );

  return results.some(Boolean);
}
