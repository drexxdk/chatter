# Chatter — Implementation Progress

Last updated: 2026-10-03

## Status: In progress — Payload admin app runnable end-to-end against local Docker Postgres/Redis

### Done

- Monorepo scaffolded: root `package.json` with npm workspaces (`apps/*`), root `docker-compose.yml` (Postgres 16 + Redis 7 for local dev), root `.env.example`.
- `apps/admin` (Payload CMS / Next.js) created via `create-payload-app`, using the Postgres adapter.
- Collections implemented in `apps/admin/src/collections`:
  - `Admins.ts` — auth-enabled, `role` field (`super-admin` / `service`), access locked to `super-admin` only, `maxLoginAttempts`/`lockTime` lockout, `useAPIKey: true` so chat-server can auth as a `service` account.
  - `PublicRooms.ts` — room config collection (admin-managed). `read` is now public (`() => true`) so the web lobby can list rooms without authenticating; writes still `super-admin`-only.
  - `Bans.ts` — hashed-identifier ban list. `read` restricted to `service` or `super-admin` roles only (verified: unauthenticated `GET /api/bans` → 403); writes still `super-admin`-only.
- `payload.config.ts` wired up with all three collections, Postgres adapter reading `DATABASE_URL`, Lexical editor, types output to `payload-types.ts`. Removed default Media collection/sharp dependency (not needed — no file uploads in this app).
- Seed script added: `apps/admin/src/seed/index.ts` + `npm run seed` script (`tsx`) to create the first `super-admin` from env vars. Verified working: created `admin@chatter.local`.
- Fixed `apps/admin/next.config.ts`: `turbopack.root` was pointing at `apps/admin` itself, which broke Turbopack's resolution of hoisted monorepo deps (`next` lives in the root `node_modules` via npm workspaces), causing `Could not find the Next.js package` on `npm run dev`. Changed to `path.resolve(dirname, '../..')` (the repo root). Dev server now boots cleanly.
- Verified end-to-end locally:
  - `docker compose up -d` brings up `chatter-postgres-1` (5432) and `chatter-redis-1` (6379), both healthy.
  - `npm run dev --workspace apps/admin` boots, Payload pulls/pushes schema, creates all expected tables (`admins`, `admins_sessions`, `bans`, `public_rooms`, `payload_migrations`, etc.).
  - `npm run seed --workspace apps/admin` creates the first super-admin.
  - `GET /api/public-rooms` unauthenticated → 200 (public read confirmed).
  - `GET /api/bans` unauthenticated → 403 (locked down as intended).

### Not yet done

- `apps/chat-server` (Socket.IO + Redis realtime service) — not created yet.
- `apps/web` (React + Vite + Tailwind + i18n chat frontend) — not created yet.
- Service-to-service API key flow (chat-server calling Payload) not implemented.
- No tests written yet (Vitest/Playwright scaffolding exists from `create-payload-app` template but no project-specific tests added).
- Login at `/admin` UI not manually verified in a browser yet (API-level checks only).

### Environment notes

- Docker Desktop must be started manually/by the OS before `docker compose up -d` will work on this machine.
- Watch for other local projects binding port 5432 (e.g. an unrelated `payload-cms-postgres-1` container was found occupying it — stopped via `docker stop`). If `docker compose up -d` fails with "port is already allocated" on 5432/6379, find and stop the conflicting container first.
- If Postgres container shows healthy but `docker port <container>` / compose `ports` column is empty (stale port binding after a failed start), run `docker compose up -d --force-recreate postgres` to fix it.

## Next Steps (in order)

1. Manually verify `/admin` login in a browser with the seeded super-admin credentials (from `apps/admin/.env`: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).
2. Scaffold `apps/chat-server`: Express/Fastify + Socket.IO + ioredis, health check, Payload API-key client, room/ban cache sync job.
3. Scaffold `apps/web`: Vite + React + TS + Tailwind + react-i18next (en/da/de locale files), lobby + guest-join modal.
4. Continue through remaining plan phases (guest auth, room runtime, messaging, presence/inactivity, frontend features, security hardening pass).

## Reference

Full architecture/plan (stack choices, phases, decisions) was agreed in chat prior to implementation — not yet copied into the repo. Consider adding a `docs/plan.md` if you want it version-controlled.
