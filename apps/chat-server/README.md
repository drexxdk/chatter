# Chatter — Chat Server

The realtime backend end-users connect to. Built with Express + Socket.IO, backed by Redis (for the Socket.IO adapter and for caching room/ban data from `apps/admin`). This is not the admin panel — see `apps/admin` for that.

## Responsibilities

- Serves the Socket.IO endpoint the chat client (`apps/web`) connects to.
- Authenticates to `apps/admin` (Payload) as a `service`-role account using an API key, and periodically syncs public room configs and the ban list into Redis so socket handshakes never block on an upstream HTTP call.
- `GET /health` — liveness check.
- `GET /rooms` — cached public room list (mirrors Payload's `/api/public-rooms`, but only `id`, `name`, `slug`, `maxMembers` and `description`). Limited to 60 requests per minute per client IP: over that it answers `429 { "error": "rate_limited" }` with a `Retry-After` header, and every answer carries a `RateLimit` header with the remaining allowance. Counted per server process, like the per-IP connection cap, and the client IP follows `TRUST_PROXY_HOPS`.
- All HTTP answers carry the standard security headers (Helmet). The Socket.IO endpoint is served by the same HTTP server but is not an Express route, so it does not get them.

## Local setup

1. From the repo root, make sure Postgres + Redis are up (`docker compose up -d`) and `apps/admin` is running with its database seeded (`npm run seed --workspace apps/admin`) — the seed script creates this service's API key and prints it to the console.
2. `cp .env.example .env`, paste in the `PAYLOAD_SERVICE_API_KEY` printed by the seed script, and set `BAN_HASH_SALT` to a long random string (at least 16 characters; changing it later invalidates existing bans).
3. From the repo root: `npm run dev --workspace apps/chat-server` (or `npm run dev:chat-server`).

## Socket protocol

Connect with `io(url, { auth: { nickname } })`. Nicknames are 2-24 characters (letters, digits, space, `_`, `.`, `-`). Connections are rejected with a `connect_error` message of `invalid_nickname`, `banned` (the client IP, salted and hashed, matches an active entry in the Payload `bans` collection), `too_many_connections` (the client IP already has `MAX_CONNECTIONS_PER_IP` live connections) or `unavailable` (ban cache unreachable; fails closed).

### Client IP and proxies

Bans and the per-IP connection cap both use the client's IP address. By default that is the socket's address, and the `X-Forwarded-For` header is ignored, because any client can send that header and would otherwise choose its own address to dodge a ban or the cap.

Behind a reverse proxy or load balancer every connection comes from the proxy, so set `TRUST_PROXY_HOPS` to the number of proxies **you control** in front of the server. The address is then taken that many entries from the right of `X-Forwarded-For`, which is what your own proxies appended; entries further left were supplied by the client and are ignored. A missing or too-short header falls back to the socket address. Setting it higher than the real number of proxies lets clients forge their address, and leaving it at `0` behind a proxy makes all guests look like one IP, so the cap would lock everyone out after `MAX_CONNECTIONS_PER_IP` users.

`MAX_CONNECTIONS_PER_IP` is the number of live connections one IP may have. When it is unset (or empty) there is no cap, so production should set it; `.env.example` ships with `10`. It must be a positive whole number: any other value, including `0`, stops the server at startup instead of quietly switching the protection off. It is counted per server process, so with several instances each one enforces it separately.

| Direction        | Event              | Payload                                             | Notes                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| server to client | `session`          | `{ guestId, nickname }`                             | Sent once on connect. Guests are anonymous and ephemeral.                                                                                                                                                                                                                                                                                                   |
| client to server | `room:join`        | `{ slug }`                                          | Ack: `{ ok: true, roomSlug, history }` (the room's recent messages, oldest first, same shape as `message:new`) or `{ ok: false, error }` with `room_not_found` / `room_full`. Joining a room leaves the current one.                                                                                                                                        |
| client to server | `room:leave`       | none                                                | Ack: `{ ok: true }`.                                                                                                                                                                                                                                                                                                                                        |
| client to server | `message:send`     | `{ text }`                                          | Max 1000 characters, 5 messages per 5 seconds per socket. Errors: `not_in_room` / `invalid_message` / `rate_limited`.                                                                                                                                                                                                                                       |
| server to room   | `room:presence`    | `{ roomSlug, members: [{ guestId, nickname }] }`    | Sent on join, leave and disconnect.                                                                                                                                                                                                                                                                                                                         |
| server to room   | `message:new`      | `{ id, roomSlug, guestId, nickname, text, sentAt }` | Messages are kept briefly in Redis (see Message history) so a guest who joins or reconnects can catch up.                                                                                                                                                                                                                                                   |
| server to client | `kicked`           | `{ reason }`                                        | Sent just before the server disconnects a guest. `inactivity`: no events for `INACTIVITY_TIMEOUT_MS` (default 15 minutes; it must be a positive whole number of milliseconds and cannot be switched off), where any client event counts as activity. `banned`: a ban matching the guest's IP was found while they were connected (see Bans reach the chat). |
| server to room   | `message:redacted` | `{ roomSlug, ids, guestIds }`                       | A banned guest's messages must be replaced by a placeholder: those with these message ids, and every message sent as one of these guest ids (older ones the history may no longer hold).                                                                                                                                                                    |

## Message history

Every message is also appended to a Redis list for its room, so a guest who joins, or reconnects after a drop, receives what they missed in the `room:join` acknowledgement. The list keeps the newest `ROOM_HISTORY_SIZE` messages (default 50, at most 200) and is deleted `ROOM_HISTORY_TTL_SECONDS` after the room's last message (default one hour, at most seven days). Redis is shared by all server nodes, so every node serves the same history.

- Anyone who can join a public room can read its recent history, including messages sent before they arrived. Nothing is stored beyond the limits above, and nothing is stored in Payload.
- The stored copy of a message also holds a hash of the sender's IP (the one bans use), so a ban can find it. That hash is never sent to any client.
- A message whose author is banned is replaced in the history by a placeholder `{ id, roomSlug, sentAt, banned: true }`: no text, nickname or guest id. Joining guests receive the placeholder in `history`, and clients show it instead of the message (see below).
- The history is read after the guest has joined, so a message sent at that moment arrives live, in the history, or both. The web client removes the duplicate by message id.
- If Redis cannot record a message it is still delivered live (only its history entry is lost). If the history cannot be read, the guest still joins with an empty history.

## Bans reach the chat

Bans are checked when a guest connects, and again after every ban sync (every `SYNC_INTERVAL_MS`, default 30 seconds), so a ban takes effect on guests who are already connected and on what they said:

1. Guests connected to this node whose IP hash is banned get `kicked { reason: "banned" }` and are disconnected.
2. For every public room, the messages in its history from banned IP hashes are replaced by placeholders. This runs as one Lua script inside Redis, so it cannot interleave with a message being added; it keeps the order and the expiry.
3. Each room that had messages replaced, or lost a banned guest, gets `message:redacted { roomSlug, ids, guestIds }`; clients turn those messages into placeholders on screen.
4. A message that was still being recorded when the ban landed is neither delivered nor kept.

Every node does this for its own guests, so it works with several instances; whichever node reaches Redis first reports the replaced ids. The delay is up to one sync interval after the ban is created in Payload. A replaced message stays replaced when a temporary ban expires, because its text is gone. If the history no longer holds a message that is still on someone's screen, the `guestIds` in the notice cover it, as long as the banned guest was connected when the ban landed.

## Tests

`npm test --workspace apps/chat-server` (or `npm run test:chat-server` from the repo root) runs the Vitest suite. It needs no Docker, Redis or Payload: the socket tests start the real Socket.IO server on a local port and mock only the Redis adapter, the ban cache and the room cache. Add a test next to any behavior you change in `src/`.

## Status

Handshake guest auth, ban check, a per-IP connection cap, room join/leave with an optional `maxMembers` limit (a room with no limit set is unlimited), presence, rate-limited messaging, inactivity disconnects, message history and ban enforcement for connected guests are implemented. Joins to limited rooms are serialized per room within one process, so simultaneous joins can't exceed `maxMembers`. Not yet implemented: capacity enforcement across multiple server nodes (that needs a Redis-side counter).
