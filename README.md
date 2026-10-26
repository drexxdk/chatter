# Chatter

A real-time chat for guests and members: public rooms, private messages, password and provider accounts, moderators and bans. A monorepo with three apps:

| App                                            | What it is                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| [apps/web](apps/web/README.md)                 | The client: React, Vite, Tailwind. A static build with SPA routes (`/rooms/x`). |
| [apps/chat-server](apps/chat-server/README.md) | Express and Socket.IO, with Redis. Needs one always-running process.            |
| [apps/admin](apps/admin/README.md)             | Payload CMS on Next.js, with Postgres: rooms, bans and admin accounts.          |

## Run it locally

Needs Node 20 or newer and Docker (Postgres and Redis come from `docker-compose.yml`).

```
npm run setup    # first time only: dependencies, .env files, Postgres and Redis, seed
npm start        # admin :3000, chat-server :4000, web :5173 (npm run stop to stop)
```

`npm run setup` is for local development only. It creates the `.env` files with generated secrets, starts Postgres and
Redis, and seeds the first super-admin (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in `apps/admin/.env`), the sample rooms
and the chat-server's API key. It can be run again: it keeps what is already filled in. If the database already has the
chat-server's account but the key is missing from `apps/chat-server/.env`, reset the local database with
`docker compose down -v` and run it again. Checks: `npm run format:check`, `lint`, `typecheck`,
`test:chat-server`, `test:web` and `test:web:e2e`. CI runs the same.

### Local Commit And Push Checks

`npm install` installs the repository's Husky hooks automatically. For an existing installation, run `npm run prepare` once.

- Committing formats staged files with Prettier, then runs the check-runner tests, lint, types and related web/chat-server unit tests. lint-staged preserves unstaged edits in partially staged files. Dependency or test-configuration changes run the affected full unit suite instead. Admin changes run the database-free environment tests.
- Pushing requires a clean working tree and runs formatting, lint, types, all web/chat-server unit tests, admin environment tests, web/chat-server builds and the full web E2E suite. Allow several minutes. Redis and the seeded admin must already be running locally (`npm start`); Playwright starts its own isolated chat/web servers. Redis-backed server tests default to database 9. E2E uses database 1 and never rewrites local env files.
- Run `npm run check` to run the full checks manually on the working tree, `npm run check:commit` for staged-file checks, or append `-- --dry-run` to list the planned commands without running them. Run `npm run test:checks` to test the runner itself.
- Formatting is repaired automatically on commit. Lint, type, build and test failures stop the operation and must be fixed before retrying. Checks use the working tree, so keep unrelated edits separate; a partially staged commit can still differ from the files tested locally.

CI remains authoritative: these hooks do not reproduce the Linux/Node 24 environment, Docker image builds, database migration checks or database-backed admin integration tests. Hooks are local and can be bypassed with Git's `--no-verify`; bypassing does not disable CI.

## How it is hosted

Roughly $0 a month, on one small machine:

| Part                                       | Where                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Web                                        | Cloudflare Pages, `https://chatter-drexx.pages.dev`, built from `main` by Cloudflare itself                      |
| Chat-server, admin, Postgres, Redis, Caddy | One Oracle Cloud Always Free ARM machine, Docker Compose (`docker-compose.prod.yml`)                             |
| API and admin addresses                    | DuckDNS names `chatter-drexx-api.duckdns.org` and `chatter-drexx-admin.duckdns.org`; Caddy gets the certificates |
| Backups                                    | Nightly `pg_dump` to Cloudflare R2 (`chatter-backups`)                                                           |
| Uptime                                     | UptimeRobot: the web, `/health` on the API, `/admin/login` on the admin                                          |

A push to `main` that passes CI is deployed: `.github/workflows/deploy.yml` builds ARM images, pushes them to GHCR and
restarts the stack over SSH. The settings (`deploy/*.env`, never committed) live on the machine, the secrets in the
owner's password manager. How to restart, roll back, rotate a secret, restore and rebuild is in
[deploy/runbook.md](deploy/runbook.md) and [deploy/restore.md](deploy/restore.md).

Things to know:

- Run **one** chat-server instance. The connection cap, room capacity lock and rate limits are per process.
- The chat-server copies rooms and bans from the admin every 30 seconds and keeps the last copy in Redis. If the admin is
  down, chat keeps working; moderator sign-in and changes to rooms or bans do not.
- The web's Content-Security-Policy is in `apps/web/nginx.conf.template`. Cloudflare Pages gets the same policy as a
  `_headers` file written at build time (`apps/web/scripts/pagesHeaders.mjs`); a test fails if the two differ.
- `VITE_CHAT_SERVER_URL` and `VITE_GIPHY_API_KEY` are baked into the web build (Pages settings). Change them, then redeploy.
- The admin migrates its database when it starts (`prodMigrations`). Change a collection, add a migration
  (`npm run migrate:create --workspace apps/admin -- <name>`); CI fails if one is missing. Production never pushes schema
  changes by itself, so do not run the seed in dev mode against it.
- Seeding a new, empty database: put the first super-admin's email and password in `deploy/seed.env` (see
  `seed.env.example`), then `bash deploy/seed.sh`. It also makes the chat-server's API key and writes it to
  `chat-server.env`. Existing accounts are not replaced. Only the one-off
  `admin-tools` service reads it.
- Postgres 16 is pinned. A newer major version needs a dump and restore ([deploy/restore.md](deploy/restore.md)).
- Dependabot opens monthly update PRs and skips major versions; those are done by hand.

### Development progress

[progress.md](progress.md) is the development checklist; git contains the change history. There are no public
roadmap/version pages or CMS publishing workflow for development updates.

About-page text lives in the web locale catalogs. Terms and privacy are published CMS content, not Markdown:
changing their seed files does not replace existing database content. The reviewed publication workflow, including
local/live preflight, backups and a substantive terms-version change, is in [deploy/runbook.md](deploy/runbook.md#terms-and-privacy).

The retirement migration preserves existing CMS roadmap and release data in the `retired_website` database schema,
outside the active Payload collections. Its rollback restores the content tables. Historical migrations are retained
so existing and new databases can follow the same migration sequence.

### Decisions

- **No domain.** The web is on `*.pages.dev`, the API and admin on DuckDNS, in `CADDY_MODE=direct` with
  `TRUST_PROXY_HOPS=1`. Cloudflare can only sit in front of a name in a zone you own. The day a domain is bought: add it
  to Cloudflare, point `API_HOST` and `ADMIN_HOST` at subdomains, set `CADDY_MODE=cloudflare` and `TRUST_PROXY_HOPS=2`,
  and test that a forged `X-Forwarded-For` has no effect.
- **Oracle Always Free** for the machine. It can be refused or reclaimed; the fallback is a small VPS (about EUR 4 a
  month), and `deploy/server-setup.sh` prepares any Ubuntu machine. Nothing is tied to Oracle.
- **The admin runs on the same machine** as the chat-server. Vercel Hobby forbids commercial use, and the chat-server
  needs the admin for moderator sign-in anyway.
- **Not Render or Koyeb free tiers** for the chat-server: they sleep when idle, which drops every connection.

### When it outgrows free

Up to a few hundred people at once fits the machine. Past that, in order: a bigger machine (EUR 5-15), a managed
Postgres, Redis moved off the machine, then more chat-server instances behind a load balancer once the per-process
limits are in Redis. Rough cost: 15-50 USD a month at launch scale, 400-1,000 USD around 100k monthly users (an estimate,
check the providers' prices).

### Where things are

- Oracle machine `chatter` (Frankfurt, Ubuntu 24.04, ARM). Admin login `~/.ssh/chatter_oracle` as `ubuntu`; the stack runs
  as the `deploy` user (`~/.ssh/chatter_deploy`) in `/opt/chatter`. The public IP is ephemeral: if it changes, update both
  DuckDNS names.
- GitHub Actions: variables `DEPLOY_HOST` and `DEPLOY_USER`, secrets `DEPLOY_SSH_KEY` (a CI-only key) and
  `DEPLOY_KNOWN_HOSTS`.
- R2 token `chatter-backups-vm` (that bucket only). Because of that, `deploy/backup.env` sets
  `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true`.
