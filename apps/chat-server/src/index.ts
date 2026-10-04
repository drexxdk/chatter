import http from "http";

import { createApp } from "./app.js";
import { env } from "./env.js";
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

startPublicRoomsSync();
startModeratorsSync((ids) => enforceModerators(io, ids));
startBansSync((hashes) => enforceBans(io, hashes));

httpServer.listen(env.PORT, () => {
  console.log(`chat-server listening on port ${env.PORT}`);
});
