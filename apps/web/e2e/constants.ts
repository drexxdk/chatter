// A separate chat-server and web client are started for the e2e run so it never touches a dev session.
export const E2E = {
  webPort: 5174,
  chatServerPort: 4100,
  payloadUrl: "http://localhost:3000",
  // Distinct Redis database and Socket.IO channel prefix keep the e2e server out of the dev server's data.
  redisUrl: "redis://localhost:6379/1",
  socketAdapterKey: "chatter-e2e",
  banHashSalt: "e2e-only-ban-salt-not-a-secret",
  authTokenSecret: "e2e-only-token-secret-not-a-secret-123456",
  syncIntervalMs: 500,
  // Marks data created by these tests so leftovers from a crashed run can be swept.
  slugPrefix: "e2e-",
  banReason: "e2e-test",
  moderatorEmailPrefix: "e2e-mod-",
} as const;

export const WEB_URL = `http://localhost:${E2E.webPort}`;
export const CHAT_SERVER_URL = `http://localhost:${E2E.chatServerPort}`;
