# Chatter — Admin (Payload CMS)

This app is the **admin/management backend** for Chatter. It is built with [Payload CMS](https://payloadcms.com) on Next.js. Super-admins manage rooms, bans, reports, accounts and published legal text here. The working end-user client lives in `apps/web` and connects through `apps/chat-server`, never directly to Payload.

It is one workspace inside the root npm-workspaces monorepo (`apps/*`), not a standalone project — commands below are meant to be run either from here or via `npm run <script> --workspace apps/admin` from the repo root.

## Stack

- [Payload CMS](https://payloadcms.com) 3 + Next.js (App Router)
- **Postgres** adapter (`@payloadcms/db-postgres`) — not MongoDB, despite what the default Payload template docs say
- No uploads/media collection — this app has no file-upload use case

## Collections

- **`Admins`** — auth-enabled. `role` is `super-admin` (can log into `/admin`), `moderator` (a chat moderator: signs in through the chat app, never the admin panel) or `service` (API-key-only, used by `apps/chat-server` to call Payload). Only `super-admin`s can access the admin panel or manage other admin accounts. `displayName` (2-24 letters, digits, spaces, `_`, `.`, `-`; unique) is the name a moderator chats under and is required for moderators. Reading is limited: `super-admin` and `service` read every account, anyone else only their own. A moderator's role takes effect in the chat when they next sign in, and a removed moderator is signed out of the chat within one sync interval of the chat server (30 seconds by default).
- **`PublicRooms`** — chat room configuration (name, slug, optional max members, slow mode, description). Leave max members empty for an unlimited room. Slow mode is the number of seconds a guest must wait between messages: it defaults to 10 for new rooms, and leaving it empty uses the chat server's default (10 seconds unless `DEFAULT_SLOW_MODE_SECONDS` is set), so no room is without a wait. Both numbers must be whole numbers of 1 or more. Publicly readable (no auth) so the chat client can list rooms; writes are `super-admin`-only.
- **`Bans`** — hashed-identifier ban list. Readable only by `service`/`super-admin` roles; writes are `super-admin`-only.
- **`Reports`** — reported public messages, sender hashes, reasons, counts and review status; retained for the configured report-retention period (90 days by default).
- **`Users`** — member accounts, including private unique usernames, shared public display names, profile data, optional password hashes and saved preferences. Members are not Payload admin users. Credential and preference fields have narrower service-only access.
- **`StaffProviderLinks` / `MemberProviderLinks`** — provider identities explicitly linked to staff or member accounts; accounts are never merged solely because email addresses match.

## Legal publishing

The localized **Terms and privacy** global holds published terms, privacy text, contact email and the acceptance version. It supports drafts and version history. A draft is not public; publishing reaches the chat-server cache on its next sync.

`src/seed/legal/` contains the reviewed English, Danish and German defaults. Ordinary seeding fills only an empty global and never overwrites an existing publication. Use the explicit preflight/backup/publication workflow in [the runbook](../../deploy/runbook.md#terms-and-privacy) to apply a reviewed update to local or live data. The October 25, 2026 revision covers password/provider accounts, browser drafts, YouTube and Turnstile.

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

See `package.json` for the full list. Common ones: `dev`, `build`, `start`, `seed`, `generate:types`, `test:int` (Vitest), `test:e2e` (Playwright), `migrate`, `migrate:create`, `migrate:status`.

## Database migrations

Schema changes live in `src/migrations`. `next dev` pushes collection changes to your local database on its own; do not point it at production. Production never pushes schema automatically: the configured `prodMigrations` applies committed migrations when Payload starts. For an explicit migration run:

```
npm run migrate --workspace apps/admin
```

When you change a collection (a field, an index, a new collection), create a migration and commit it together with the change:

```
npm run migrate:create --workspace apps/admin -- add_room_topic
```

CI applies the migrations to an empty database and fails if the collections differ from them, so a forgotten migration is caught before it reaches a deployment. A local database that was created by `next dev` has no migration history; recreate it (`docker compose down -v`, then `up -d`) before trying `migrate` on it.

## Questions

If you have Payload-specific questions, see the [Payload docs](https://payloadcms.com/docs) or their [Discord](https://discord.com/invite/payload).
