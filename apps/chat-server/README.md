# Chatter — Chat Server

The realtime backend end-users connect to. Built with Express + Socket.IO, backed by Redis (for the Socket.IO adapter and for caching room/ban data from `apps/admin`). This is not the admin panel — see `apps/admin` for that.

## Responsibilities

- Serves the Socket.IO endpoint the chat client (`apps/web`) connects to.
- Authenticates to `apps/admin` (Payload) as a `service`-role account using an API key, and periodically syncs public room configs and the ban list into Redis so socket handshakes never block on an upstream HTTP call.
- `GET /health` — liveness check.
- `GET /rooms` — cached public room list (mirrors Payload's `/api/public-rooms`).

## Local setup

1. From the repo root, make sure Postgres + Redis are up (`docker compose up -d`) and `apps/admin` is running with its database seeded (`npm run seed --workspace apps/admin`) — the seed script creates this service's API key and prints it to the console.
2. `cp .env.example .env`, paste in the `PAYLOAD_SERVICE_API_KEY` printed by the seed script, and set `BAN_HASH_SALT` to a long random string (changing it later invalidates existing bans).
3. From the repo root: `npm run dev --workspace apps/chat-server` (or `npm run dev:chat-server`).

## Socket protocol

Connect with `io(url, { auth: { nickname } })`. Nicknames are 2-24 characters (letters, digits, space, `_`, `.`, `-`). Connections are rejected with a `connect_error` message of `invalid_nickname`, `banned` (the client IP, salted and hashed, matches an active entry in the Payload `bans` collection) or `unavailable` (ban cache unreachable; fails closed).

| Direction        | Event           | Payload                                             | Notes                                                                                                                               |
| ---------------- | --------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| server to client | `session`       | `{ guestId, nickname }`                             | Sent once on connect. Guests are anonymous and ephemeral.                                                                           |
| client to server | `room:join`     | `{ slug }`                                          | Ack: `{ ok: true, roomSlug }` or `{ ok: false, error }` with `room_not_found` / `room_full`. Joining a room leaves the current one. |
| client to server | `room:leave`    | none                                                | Ack: `{ ok: true }`.                                                                                                                |
| client to server | `message:send`  | `{ text }`                                          | Max 1000 characters, 5 messages per 5 seconds per socket. Errors: `not_in_room` / `invalid_message` / `rate_limited`.               |
| server to room   | `room:presence` | `{ roomSlug, members: [{ guestId, nickname }] }`    | Sent on join, leave and disconnect.                                                                                                 |
| server to room   | `message:new`   | `{ id, roomSlug, guestId, nickname, text, sentAt }` | Messages are relayed only, not stored.                                                                                              |

## Tests

`npm test --workspace apps/chat-server` (or `npm run test:chat-server` from the repo root) runs the Vitest suite. It needs no Docker, Redis or Payload: the socket tests start the real Socket.IO server on a local port and mock only the Redis adapter, the ban cache and the room cache. Add a test next to any behavior you change in `src/`.

## Status

Handshake guest auth, ban check, room join/leave with `maxMembers` enforcement, presence and rate-limited messaging are implemented. Not yet implemented: inactivity timeouts, message history, and an atomic room-capacity check (simultaneous joins can briefly exceed `maxMembers`).
