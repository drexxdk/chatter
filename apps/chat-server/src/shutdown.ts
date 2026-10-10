// Closes the server the way a deploy expects: stop the background syncs, disconnect every client (the web client
// reconnects on its own, to another instance or to the new one), let in-flight work finish, then close Redis.

import { log as logger } from "./log.js";

export interface ShutdownTargets {
  // Socket.IO's server: closing it disconnects the sockets and closes the HTTP server it is attached to.
  io: { close(): Promise<void> };
  timers: NodeJS.Timeout[];
  // ioredis clients.
  redisClients: { quit(): Promise<unknown>; disconnect(): void }[];
  exit: (code: number) => void;
  // How long to wait before giving up and exiting anyway.
  timeoutMs?: number;
  log?: (message: string) => void;
}

export const SHUTDOWN_TIMEOUT_MS = 10_000;

export function createShutdown({
  io,
  timers,
  redisClients,
  exit,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  log = (message: string) => logger.info(message),
}: ShutdownTargets): (signal: string) => Promise<void> {
  let started = false;

  return async (signal) => {
    // A second signal while closing (a developer pressing Ctrl+C again) must not start over.
    if (started) return;
    started = true;

    log(`${signal} received, shutting down`);
    timers.forEach((timer) => clearInterval(timer));

    const giveUp = setTimeout(() => {
      log(`shutdown took more than ${timeoutMs} ms, exiting anyway`);
      exit(1);
    }, timeoutMs);
    giveUp.unref();

    let failed = false;

    try {
      await io.close();
    } catch (error) {
      failed = true;
      logger.error("Closing the socket server failed", error);
    }

    // Quitting waits for replies still on their way; disconnecting is the fallback for a connection that is gone.
    const results = await Promise.allSettled(
      redisClients.map((client) =>
        client.quit().catch(() => client.disconnect()),
      ),
    );
    failed ||= results.some((result) => result.status === "rejected");

    clearTimeout(giveUp);
    exit(failed ? 1 : 0);
  };
}
