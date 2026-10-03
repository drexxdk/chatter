# Chatter — Admin (Payload CMS)

This app is the **admin/management backend** for Chatter. It is built with [Payload CMS](https://payloadcms.com) on Next.js and is used by super-admins to manage public chat rooms and the ban list. It is **not** the end-user chat client — that lives in `apps/web` (planned) and connects through `apps/chat-server` (planned).

It is one workspace inside the root npm-workspaces monorepo (`apps/*`), not a standalone project — commands below are meant to be run either from here or via `npm run <script> --workspace apps/admin` from the repo root.

## Stack

- [Payload CMS](https://payloadcms.com) 3 + Next.js (App Router)
- **Postgres** adapter (`@payloadcms/db-postgres`) — not MongoDB, despite what the default Payload template docs say
- No uploads/media collection — this app has no file-upload use case

## Collections

- **`Admins`** — auth-enabled. `role` is `super-admin` (can log into `/admin`) or `service` (API-key-only, used by `apps/chat-server` to call Payload). Only `super-admin`s can access the admin panel or manage other admin accounts.
- **`PublicRooms`** — chat room configuration (name, slug, optional max members, description). Leave max members empty for an unlimited room. Publicly readable (no auth) so the chat client can list rooms; writes are `super-admin`-only.
- **`Bans`** — hashed-identifier ban list. Readable only by `service`/`super-admin` roles; writes are `super-admin`-only.

## Local setup

1. From the **repo root**, start Postgres + Redis:
   ```
   docker compose up -d
   ```
2. Copy the env file and fill in secrets:
   ```
   cp .env.example .env
   ```
   `DATABASE_URL` already points at the local Docker Postgres by default. Set `PAYLOAD_SECRET` (at least 16 characters; the placeholder from `.env.example` is refused) and the `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` used by the seed script below. The app validates its environment at startup and lists every invalid variable in one error.
3. From the **repo root**, install dependencies (this is an npm workspace, not pnpm):
   ```
   npm install
   ```
4. Start the dev server:
   ```
   npm run dev --workspace apps/admin
   ```
   (or `npm run dev:admin` from the repo root, or just `npm run dev` from inside this folder)
5. Open http://localhost:3000/admin
6. Create the first super-admin by running the seed script instead of the on-screen signup form:
   ```
   npm run seed --workspace apps/admin
   ```
   Log in with the `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` from your `.env`.

## Scripts

See `package.json` for the full list. Common ones: `dev`, `build`, `start`, `seed`, `generate:types`, `test:int` (Vitest), `test:e2e` (Playwright).

## Questions

If you have Payload-specific questions, see the [Payload docs](https://payloadcms.com/docs) or their [Discord](https://discord.com/invite/payload).
