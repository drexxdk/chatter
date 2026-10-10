import http from "http";

import { createApp } from "./app.js";
import { env } from "./env.js";
import { pubClient, redis, subClient } from "./redis.js";
import { createShutdown } from "./shutdown.js";
import {
  createSocketServer,
  enforceBans,
  enforceModerators,
} from "./socket.js";
import { startPublicRoomsSync } from "./rooms.js";
import { startBansSync } from "./bans.js";
import { startModeratorsSync } from "./names.js";

const httpServer = http.createServer(createApp());
const io = createSocketServer(httpServer);

const timers = [
  startPublicRoomsSync(),
  startModeratorsSync((ids) => enforceModerators(io, ids)),
  startBansSync((hashes) => enforceBans(io, hashes)),
];

const shutdown = createShutdown({
  io,
  timers,
  redisClients: [redis, pubClient, subClient],
  exit: (code) => process.exit(code),
});

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

httpServer.listen(env.PORT, () => {
  console.log(`chat-server listening on port ${env.PORT}`);
});
