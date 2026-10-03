# Chatter — Chat Server

The realtime backend end-users connect to. Built with Express + Socket.IO, backed by Redis (for the Socket.IO adapter and for caching room/ban data from `apps/admin`). This is not the admin panel — see `apps/admin` for that.

## Responsibilities

- Serves the Socket.IO endpoint the chat client (`apps/web`) connects to.
- Authenticates to `apps/admin` (Payload) as a `service`-role account using an API key, and periodically syncs public room configs and the ban list into Redis so socket handshakes never block on an upstream HTTP call.
- `GET /health` — liveness check.
- `GET /rooms` — cached public room list (mirrors Payload's `/api/public-rooms`).

## Local setup

1. From the repo root, make sure Postgres + Redis are up (`docker compose up -d`) and `apps/admin` is running with its database seeded (`npm run seed --workspace apps/admin`) — the seed script creates this service's API key and prints it to the console.
2. `cp .env.example .env` and paste in the `PAYLOAD_SERVICE_API_KEY` printed by the seed script.
3. From the repo root: `npm run dev --workspace apps/chat-server` (or `npm run dev:chat-server`).

## Status

Early scaffold: health check, Payload API-key client, and room/ban cache sync are in place. Guest auth, room join/leave, and message handling are not implemented yet.
