import http from "http";

import { createApp } from "./app.js";
import { env } from "./env.js";
import { createSocketServer } from "./socket.js";
import { startPublicRoomsSync } from "./rooms.js";
import { startBansSync } from "./bans.js";

const httpServer = http.createServer(createApp());
createSocketServer(httpServer);

startPublicRoomsSync();
startBansSync();

httpServer.listen(env.PORT, () => {
  console.log(`chat-server listening on port ${env.PORT}`);
});
