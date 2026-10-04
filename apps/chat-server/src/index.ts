import http from "http";

import { createApp } from "./app.js";
import { env } from "./env.js";
import { createSocketServer, enforceBans } from "./socket.js";
import { startPublicRoomsSync } from "./rooms.js";
import { startBansSync } from "./bans.js";
import { startModeratorNamesSync } from "./names.js";

const httpServer = http.createServer(createApp());
const io = createSocketServer(httpServer);

startPublicRoomsSync();
startModeratorNamesSync();
startBansSync((hashes) => enforceBans(io, hashes));

httpServer.listen(env.PORT, () => {
  console.log(`chat-server listening on port ${env.PORT}`);
});
