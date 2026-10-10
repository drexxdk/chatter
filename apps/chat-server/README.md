# Chatter — Chat Server

The realtime backend end-users connect to. Built with Express + Socket.IO, backed by Redis (for the Socket.IO adapter and for caching room/ban data from `apps/admin`). This is not the admin panel — see `apps/admin` for that.

## Responsibilities

- Serves the Socket.IO endpoint the chat client (`apps/web`) connects to.
- Authenticates to `apps/admin` (Payload) as a `service`-role account using an API key, and periodically syncs public room configs and the ban list into Redis so socket handshakes never block on an upstream HTTP call.
- `GET /health` — liveness check.
- `GET /rooms` — cached public room list (mirrors Payload's `/api/public-rooms`, but only `id`, `name`, `slug`, `maxMembers`, `slowModeSeconds` and `description`). Limited to `ROOMS_RATE_LIMIT_PER_MINUTE` requests (default 60) per minute per client IP: over that it answers `429 { "error": "rate_limited" }` with a `Retry-After` header, and every answer carries a `RateLimit` header with the remaining allowance. Counted per server process, like the per-IP connection cap, and the client IP follows `TRUST_PROXY_HOPS`.
- `POST /moderator/login` — moderator sign-in (see Moderators). Limited to 10 requests per 15 minutes per client IP.
- All HTTP answers carry the standard security headers (Helmet). The Socket.IO endpoint is served by the same HTTP server but is not an Express route, so it does not get them.

## Local setup

1. From the repo root, make sure Postgres + Redis are up (`docker compose up -d`) and `apps/admin` is running with its database seeded (`npm run seed --workspace apps/admin`) — the seed script creates this service's API key and prints it to the console.
2. `cp .env.example .env`, paste in the `PAYLOAD_SERVICE_API_KEY` printed by the seed script, and set `BAN_HASH_SALT` to a long random string (at least 16 characters; changing it later invalidates existing bans).
3. From the repo root: `npm run dev --workspace apps/chat-server` (or `npm run dev:chat-server`).

## Socket protocol

Connect with `io(url, { auth: { nickname, avatar, guestId, resumeSecret } })` as a guest (`avatar`, `guestId` and `resumeSecret` are optional, see Resuming an identity), or `io(url, { auth: { token } })` as a moderator (see Moderators). Nicknames are 2-24 characters (letters, digits, space, `_`, `.`, `-`). Connections are rejected with a `connect_error` message of `invalid_nickname`, `reserved_nickname` (the nickname is a moderator's name or looks like an authority such as "Admin"), `invalid_token` (the moderator token is wrong, expired, or sign-in is switched off), `banned` (the client IP, salted and hashed, matches an active entry in the Payload `bans` collection), `too_many_connections` (the client IP already has `MAX_CONNECTIONS_PER_IP` live connections) or `unavailable` (ban or moderator-name cache unreachable; fails closed).

A client may send packets of up to 8 KB (`MAX_PACKET_BYTES` in `socket.ts`; Socket.IO's default is 1 MB, and the biggest thing a client sends is a 500-character message). A larger one closes its connection. The server pings every 25 s and drops a client that does not answer within 20 s.

### Logs

The server writes one JSON object per line (`src/log.ts`): `time`, `level`, `message`, and for errors an `error` with the name, message and stack, plus fields such as `room` where they help. Errors go to the standard error, information to the standard output, so a log collector can filter on the fields. Moderator sign-in failures log only the error's message, because the stack of a failed sign-in call can carry what was sent.

### Shutting down

On `SIGTERM` or `SIGINT` (`src/shutdown.ts`) the server stops the background syncs, disconnects all clients and closes the HTTP server, quits its three Redis connections, and exits with 0 (1 if something failed, or if all that took more than 10 s). Clients reconnect on their own, so a deploy only shows as a short reconnect. A second signal while closing is ignored.

### Client IP and proxies

Bans and the per-IP connection cap both use the client's IP address. By default that is the socket's address, and the `X-Forwarded-For` header is ignored, because any client can send that header and would otherwise choose its own address to dodge a ban or the cap.

Behind a reverse proxy or load balancer every connection comes from the proxy, so set `TRUST_PROXY_HOPS` to the number of proxies **you control** in front of the server. The address is then taken that many entries from the right of `X-Forwarded-For`, which is what your own proxies appended; entries further left were supplied by the client and are ignored. A missing or too-short header falls back to the socket address. Setting it higher than the real number of proxies lets clients forge their address, and leaving it at `0` behind a proxy makes all guests look like one IP, so the cap would lock everyone out after `MAX_CONNECTIONS_PER_IP` users.

`MAX_CONNECTIONS_PER_IP` is the number of live connections one IP may have. When it is unset (or empty) there is no cap, so production should set it; `.env.example` ships with `10`. It must be a positive whole number: any other value, including `0`, stops the server at startup instead of quietly switching the protection off. It is counted per server process, so with several instances each one enforces it separately.

| Direction        | Event              | Payload                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| server to client | `session`          | `{ guestId, nickname, role, avatar }`                             | Sent once on connect. `role` is `guest` or `moderator`; guests are anonymous and ephemeral.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| client to server | `room:join`        | `{ slug }`                                                        | Ack: `{ ok: true, roomSlug, history }` (the room's recent messages, oldest first, same shape as `message:new`) or `{ ok: false, error }` with `room_not_found` / `room_full` / `nickname_taken` (somebody else in that room has the same name; see Nicknames in a room). Joining a room leaves the current one.                                                                                                                                                                                                                               |
| client to server | `room:leave`       | none                                                              | Ack: `{ ok: true }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| client to server | `message:send`     | `{ text }`                                                        | Max 500 characters, over as many lines as fit (a run of blank lines is cut to one). At most 5 messages per 5 seconds per connection, and one message per `slowModeSeconds` of the room (a room that leaves it empty in Payload gets `DEFAULT_SLOW_MODE_SECONDS`, default 10, so `/rooms` always shows the number in force), counted per connection across rooms; refused attempts do not extend the wait. A refusal is `{ ok: false, error: "rate_limited", retryAfterMs }`. Other errors: `not_in_room` / `invalid_message` / `unavailable`. |
| server to room   | `room:presence`    | `{ roomSlug, members: [{ guestId, nickname, role, avatar }] }`    | Sent on join, leave and disconnect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| server to room   | `message:new`      | `{ id, roomSlug, guestId, nickname, role, avatar, text, sentAt }` | Messages are kept briefly in Redis (see Message history) so a guest who joins or reconnects can catch up.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| server to client | `kicked`           | `{ reason }`                                                      | Sent just before the server disconnects a guest. `inactivity`: no events for `INACTIVITY_TIMEOUT_MS` (default 15 minutes; it must be a positive whole number of milliseconds and cannot be switched off), where any client event counts as activity. `banned`: a ban matching the guest's IP was found while they were connected (see Bans reach the chat).                                                                                                                                                                                   |
| server to room   | `message:redacted` | `{ roomSlug, ids, guestIds }`                                     | A banned guest's messages must be replaced by a placeholder: those with these message ids, and every message sent as one of these guest ids (older ones the history may no longer hold).                                                                                                                                                                                                                                                                                                                                                      |

## Moderators

A moderator is an `apps/admin` account whose role is `moderator` or `super-admin` and which has a display name. Moderators are the only users with a role other than `guest`; roles and what each may do live in one table, `ROLE_RULES` in `src/roles.ts` (a moderator ignores IP bans and may announce; a guest does neither), so a later role is a new row.

1. The client posts `{ email, password }` as JSON to `POST /moderator/login`. The chat server forwards them to Payload's own login, which checks them; the password is never stored or logged.
2. On success it answers `{ token, name, role, expiresAt }`. The token is signed with HMAC-SHA256 using `AUTH_TOKEN_SECRET` (at least 32 characters) and holds only the account id, display name, role and expiry. It lasts 8 hours.
3. The client connects with `auth: { token }`. The name always comes from the account; a moderator cannot pick one.

Failures: `400 invalid_request`, `401 invalid_credentials`, `403 not_a_moderator` (a valid account that is not a moderator), `403 no_display_name`, `413 payload_too_large`, `429 rate_limited`, `503 moderator_login_disabled` (no `AUTH_TOKEN_SECRET`) or `503 unavailable` (Payload unreachable).

Good to know:

- `AUTH_TOKEN_SECRET` is optional. Without it moderator sign-in is off and every token is refused; guests are unaffected. Changing it signs every moderator out.
- A token is also checked against the moderators the server last read from Payload (every `SYNC_INTERVAL_MS`): at sign-in a token for an account that may no longer moderate is refused with `invalid_token`, and after every sync connected moderators whose account was removed, or lost the role, get `kicked { reason: "invalid_token" }` and are disconnected. So removing a moderator takes effect within one sync interval, not when the token expires. If the list has never been read, or Redis cannot be reached, sign-in fails closed with `unavailable`. Signing in through `POST /moderator/login` records the account in that list at once, so a new moderator is not turned away before the next sync.
- Guests may not use a moderator's name (compared ignoring case, spaces and punctuation) or a name that starts or ends with `moderator`, `administrator`, `admin`, `staff`, `support` or `system`, or is exactly `mod`. Moderator names are synced into Redis every `SYNC_INTERVAL_MS`.
- A moderator's stored history copy carries no IP hash, so a ban can never redact their messages, and `enforceBans` never kicks them. Slow mode and the flood limit apply to moderators as to everyone.
- Moderators do not count toward `MAX_CONNECTIONS_PER_IP` and are not refused when it is full, so somebody can always moderate while guests fill the limit.

## Announcements

A moderator can tell everyone who is connected something, whether or not they are in a room.

- `announce:send` `{ text }` (client to server, moderators only). The text is trimmed and must be 1-500 characters. Ack: `{ ok: true }`, or `{ ok: false, error }` with `forbidden` (not a moderator), `invalid_message`, `rate_limited` (with `retryAfterMs`) or `unavailable` (the wait could not be checked; nothing is sent).
- `announcement:new` `{ id, text, sentAt, name }` (server to every connection, on every node). `name` is the moderator's display name.
- A moderator may announce once a minute. The wait is kept in Redis per account, taken atomically, so a second connection or a second node is no way round it. An attempt that is refused for its text does not use up the turn.
- Only the latest announcement is kept, in Redis for an hour. Every connection is sent it right after `session`, so someone who arrives later sees it too. If it cannot be kept, it is still delivered live; if it cannot be read, the guest connects without it.
- Announcements are not part of any room's history and cannot be redacted. Clients decide how long to show one (the web client lets people dismiss it and does not show the same one again after a reconnect).

## Avatars

A guest can say how they want to be shown next to their messages: `avatar` in the handshake is `male`, `female`, `trans` or `other`. It is self-declared and optional, nothing is checked, and anything missing or unknown (including a wrong case) becomes `other`, the plain one, rather than turning the guest away. Moderators always have `other` until accounts have a profile. The avatar is sent in `session`, in the room's presence list, with every message (and in a room's history) and as `fromAvatar` / `toAvatar` in direct messages. How each one looks is up to the client; the web client shows the usual symbol and colour for male and female, the transgender symbol in the colours of its flag for trans, and a plain silhouette for other.

## Profile and age

A guest may also give an `age` in the handshake: a whole number from 18 to 120 (`MIN_AGE` and `MAX_AGE` in `src/age.ts`). It is optional and anything else is ignored, like an unknown avatar. When given it is sent in `session` and in every entry of the room's presence list, so the other guests see it; it is not part of messages. A guest changes who they are shown as with `profile:update` `{ nickname?, avatar?, age? }` (client to server): each field is changed only when it is present, and an `age` of `null` takes it back. The name is checked as at the handshake (`invalid_nickname`, `reserved_nickname`), an unknown avatar or an age out of range is `invalid_profile`, a moderator gets `forbidden` (their name belongs to their account), and more than five changes in a minute are `rate_limited` with `retryAfterMs`. Ack `{ ok: true, profile: { nickname, avatar, age? } }`; everything is checked before anything changes, the room gets a new presence list, and what the guest writes afterwards carries the new name and avatar.

## Nicknames in a room

A nickname is reserved for as long as somebody has it in a room: `room:join` is answered with `nickname_taken` when another guest in that room already has the same name, and so is `profile:update` when a guest renames themselves to such a name. Names are compared as the handshake's reserved-name check does, so case, spaces and punctuation do not make one different (`alice`, `A l i c e` and `Al.ice` are the same name). The check and the join or rename happen under the room's lock, so two guests choosing the same name at once cannot both get it, and the name is free again when its owner leaves or disconnects. Another room may use it, and a guest who resumes their identity is not mistaken for their own old connection. Registered users are unique by account: a moderator's display name is unique in Payload and reserved from guests (`reserved_nickname`), and the same account signed in twice counts as one person.

## Direct messages

A guest can write privately to another guest who is in the same room. Nothing is stored on the server: a direct message exists only while both connections do. A guest who reloads keeps their identity (see Resuming an identity), and the web client keeps its own side of the conversations in the tab's session storage. (Keeping them on the server for signed-in members is planned, see progress.md.)

- `dm:send` `{ toGuestId, text }` (client to server). `toGuestId` is the `guestId` shown in the room's presence list. The text is trimmed and must be 1-500 characters, with the same line handling as `message:send`. Ack: `{ ok: true }`, or `{ ok: false, error }` with `not_in_room`, `invalid_recipient` (missing, or yourself), `invalid_message`, `recipient_blocked` (the sender has blocked them), `blocked_by_recipient` (they have blocked the sender; nothing is sent), `user_not_found` (not in this room right now, or gone), `rate_limited` (with `retryAfterMs`) or `unavailable`.
- `dm:new` `{ id, fromGuestId, fromNickname, fromRole, fromAvatar, toGuestId, toNickname, toAvatar, text, sentAt }` (server to the recipient **and** to the sender). The sender is shown the message through the same event, so a client has one place to read them from.
- `dm:block` `{ guestId }` and `dm:unblock` `{ guestId }` (client to server). Ack `{ ok: true }`, or `invalid_request` / `too_many_blocked` (at most 100 per connection). A blocked guest's messages no longer reach the person who blocked them: their `dm:send` is refused with `blocked_by_recipient`, and nothing is delivered or echoed. The blocked guest is also told when it happens, with `dm:blocked` `{ guestId, nickname, role, avatar }` (server to them, naming who blocked them) and `dm:unblocked` with the same payload when it is undone; nothing is sent for blocking somebody twice or unblocking somebody who was not blocked. The person who blocked somebody cannot write to them either (`recipient_blocked`) until they unblock them. Moderators cannot be blocked (`blockable` in `ROLE_RULES`), so a warning always gets through, and they are not told. The list belongs to the connection and is forgotten when it ends; the web client sends it again after a reconnect.
- Limits: direct messages count in the same flood limit as room messages (5 per 5 seconds per connection), and starting conversations with new people is limited to 5 per minute (messaging somebody already messaged is not counted). Slow mode does not apply. A message that is refused or never arrives uses up nothing.
- Direct messages never go into a room's history and cannot be read by moderators.
- Bans: a banned guest is disconnected like any other. Their `message:redacted` notice carries their `guestIds`, which clients also use to turn what they wrote in direct conversations into placeholders.

## Resuming an identity

A reload is a new connection, which would normally be a new guest (new `guestId`) that others see leave and a stranger arrive. To avoid that, every connection is given a secret in `session.resumeSecret`. The client keeps it with its `guestId` and sends both as `auth.guestId` and `auth.resumeSecret` on its next connection. If they match, the new connection takes that `guestId`; the old connection, if the server has not noticed it is gone, gets `kicked { reason: "replaced" }` and is disconnected. If they do not match, or are missing, the connection simply gets an identity of its own (nothing is refused).

- Only a hash (SHA-256) of the secret is stored, in Redis under `chatter:resume:<guestId>` for one hour (`RESUME_TTL_SECONDS`), and it is compared in constant time.
- A new secret is issued on every connection, so one that was seen or copied stops working as soon as the guest connects again. It is never sent to other clients (not in presence or messages).
- The secret only proves it is the same guest; bans, nickname rules and caps are checked as for any connection. If Redis cannot be reached the connection is refused with `unavailable`.

## Message history

Every message is also appended to a Redis list for its room, so a guest who joins, or reconnects after a drop, receives what they missed in the `room:join` acknowledgement. The list keeps the newest `ROOM_HISTORY_SIZE` messages (default 50, at most 200) and is deleted `ROOM_HISTORY_TTL_SECONDS` after the room's last message (default one hour, at most seven days). Redis is shared by all server nodes, so every node serves the same history.

- Anyone who can join a public room can read its recent history, including messages sent before they arrived. Nothing is stored beyond the limits above, and nothing is stored in Payload.
- The stored copy of a message also holds a hash of the sender's IP (the one bans use), so a ban can find it. That hash is never sent to any client.
- A message whose author is banned is replaced in the history by a placeholder `{ id, roomSlug, sentAt, banned: true }`: no text, nickname or guest id. Joining guests receive the placeholder in `history`, and clients show it instead of the message (see below).
- The history is read after the guest has joined, so a message sent at that moment arrives live, in the history, or both. The web client removes the duplicate by message id.
- If Redis cannot record a message it is still delivered live (only its history entry is lost). If the history cannot be read, the guest still joins with an empty history.

## Reactions

A guest in a room can react to one of its messages with an emoji, as in Teams: the message shows each emoji with how many reacted.

- `reaction:toggle` `{ messageId, emoji }` (client to server) adds the guest's reaction, or removes it if they had already made it. The emoji must be one of the fixed set in `src/reactions.ts` (the web client's picker offers the same set), and the message must be one the room still remembers. Ack: `{ ok: true }`, or `{ ok: false, error }` with `not_in_room`, `invalid_reaction` (unknown emoji or message id, or the message is the guest's own, or it already has 20 different emojis or 200 reactors on that emoji), `message_not_found` (no longer in the history, or replaced by a ban placeholder), `rate_limited` (more than 10 in five seconds, with `retryAfterMs`) or `unavailable`.
- `reaction:update` `{ roomSlug, messageId, reactions }` (server to room) carries the message's complete reactions after every change: `[{ emoji, users: [{ guestId, nickname }] }]`, in the order the emojis were first used. Clients replace what they have.
- Reactions live in the message's history entry (one atomic Redis script rewrites it), so they are served with the history to guests who join later and expire with it. Only messages still in the history can be reacted to. Direct messages cannot be reacted to.
- The nickname is the one the guest had when they reacted.

## Bans reach the chat

Bans are checked when a guest connects, and again after every ban sync (every `SYNC_INTERVAL_MS`, default 30 seconds), so a ban takes effect on guests who are already connected and on what they said:

1. Guests connected to this node whose IP hash is banned get `kicked { reason: "banned" }` and are disconnected.
2. For every public room, the messages in its history from banned IP hashes are replaced by placeholders. This runs as one Lua script inside Redis, so it cannot interleave with a message being added; it keeps the order and the expiry.
3. Each room that had messages replaced, or lost a banned guest, gets `message:redacted { roomSlug, ids, guestIds }`; clients turn those messages into placeholders on screen.
4. A message that was still being recorded when the ban landed is neither delivered nor kept.

Every node does this for its own guests, so it works with several instances; whichever node reaches Redis first reports the replaced ids. The delay is up to one sync interval after the ban is created in Payload. A replaced message stays replaced when a temporary ban expires, because its text is gone. If the history no longer holds a message that is still on someone's screen, the `guestIds` in the notice cover it, as long as the banned guest was connected when the ban landed.

## Docker

`apps/chat-server/Dockerfile` builds a production image (Node 24, non-root, a health check on `/health`). Build from the repository root, which holds the lockfile:

```sh
docker build -f apps/chat-server/Dockerfile -t chatter-chat-server .
docker run -p 4000:4000 --env-file apps/chat-server/.env -e REDIS_URL=redis://host.docker.internal:6379 -e PAYLOAD_URL=http://host.docker.internal:3000 chatter-chat-server
```

The settings are the environment variables from `.env.example`; inside a container `localhost` is the container itself, so Redis and Payload need their real addresses. The image starts `node` directly (not through `npm`), so `docker stop` reaches the server as `SIGTERM` and it shuts down gracefully.

## Tests

`npm test --workspace apps/chat-server` (or `npm run test:chat-server` from the repo root) runs the Vitest suite. `npm run lint --workspace apps/chat-server` runs ESLint (recommended TypeScript rules), which CI also runs. It needs no Docker, Redis or Payload: the socket tests start the real Socket.IO server on a local port and mock only the Redis adapter, the ban cache and the room cache. Add a test next to any behavior you change in `src/`.

The one exception is `src/history.redis.test.ts`, which runs the history's Lua scripts (reactions, ban redaction) against a real Redis and is skipped unless `TEST_REDIS_URL` is set. Locally, with the Redis from `docker compose up -d`: `$env:TEST_REDIS_URL = "redis://localhost:6379/9"` (PowerShell) or `TEST_REDIS_URL=redis://localhost:6379/9` (sh), then `npm test`. It uses a database index of its own and a room name of its own per test, and removes what it writes. CI sets it from a Redis service container.

## Status

Handshake guest auth, ban check, a per-IP connection cap, room join/leave with an optional `maxMembers` limit (a room with no limit set is unlimited), presence, rate-limited messaging, inactivity disconnects, message history and ban enforcement for connected guests are implemented. Joins to limited rooms are serialized per room within one process, so simultaneous joins can't exceed `maxMembers`. Not yet implemented: capacity enforcement across multiple server nodes (that needs a Redis-side counter).
