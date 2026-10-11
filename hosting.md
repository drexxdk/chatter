# Chatter — Hosting plan and progress

Goal: run Chatter publicly for as close to $0 as possible as a hobby project, without hired staff, and keep a clear
path to a paid setup when it grows. This file replaces `progress.md` (the feature work is done; its history is in git).

Status legend: `[ ]` to do, `[x]` done, `[~]` in progress. Prices and free-tier limits below are from memory and
must be checked on the providers' pages before relying on them.

## 1. What has to be hosted

| Part               | What it is                                             | Needs                                                          |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------------------- |
| `apps/web`         | Static Vite build, SPA routes like `/rooms/music`      | Static hosting, SPA fallback, a Content-Security-Policy header |
| `apps/chat-server` | Node, Express, Socket.IO, Redis adapter                | A process that stays running (websockets), Redis, HTTPS/WSS    |
| `apps/admin`       | Payload CMS on Next.js                                 | Node host, Postgres; reachable by the chat-server (see below)  |
| Postgres           | Payload's database (rooms, bans, admins)               | Free tier or a container                                       |
| Redis              | Room history, cached rooms and bans, Socket.IO adapter | Persistent (AOF) on the VM; room/ban cache has no expiry       |
| Object storage     | Profile pictures and chat images (later)               | S3-compatible bucket                                           |

Facts about the code that shape the plan:

- The chat-server reads rooms and bans from Payload every `SYNC_INTERVAL_MS` (30 s default) and keeps the last good
  copy in Redis **without an expiry**. If the admin is offline the chat keeps working from that cache, but **moderator
  sign-in** (`/moderator/login`) and changes to rooms or bans need the admin to be reachable.
- Every sync is a database query through Payload. With Postgres on the same VM that costs a little CPU and nothing else.
- The Redis-backed limits (per-IP connection cap, room capacity lock, `/rooms` rate limit) are per process, so run
  **one** chat-server instance until they move into Redis (documented in the chat-server README).
- The web image's Content-Security-Policy lives in `apps/web/nginx.conf.template`. Cloudflare Pages gets the same policy
  as a `_headers` file written at build time (`apps/web/scripts/pagesHeaders.mjs`); a test fails if the two differ.
- Payload migrations exist (`apps/admin/src/migrations`) and run when the production admin starts (`prodMigrations`).
- `VITE_CHAT_SERVER_URL` and `VITE_GIPHY_API_KEY` are baked into the web build.

## 2. Target setup ($0 plus an optional domain)

| Part                         | Where                                                                                                                                                                                                   | Why                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Web                          | Cloudflare Pages                                                                                                                                                                                        | Free, global CDN, SPA fallback built in, no repo-name subpath (unlike GitHub Pages)                            |
| Chat-server, Redis, Postgres | One always-on VM: Oracle Cloud Always Free (ARM), fallback a ~EUR 4/month VPS (e.g. Hetzner)                                                                                                            | Websockets need an always-on process; one box holds everything, so there are no external limits or cold starts |
| Admin                        | Same VM (Docker)                                                                                                                                                                                        | Always reachable for the sync and moderator sign-in; no serverless limits                                      |
| TLS and routing              | Caddy on the VM (automatic certificates)                                                                                                                                                                | One small config file                                                                                          |
| Images (later)               | Cloudflare R2                                                                                                                                                                                           | 10 GB free, no egress fees                                                                                     |
| Backups                      | Nightly `pg_dump` to R2                                                                                                                                                                                 | The VM would otherwise hold the only copy of the data                                                          |
| Uptime check                 | UptimeRobot (free) on `/health`                                                                                                                                                                         | Tells you when it is down                                                                                      |
| Domain                       | None for now: a `*.pages.dev` address for the web and free DuckDNS names for the API and the admin. A domain (~10 USD/year, `.dk` ~ 50 kr) is needed for Cloudflare in front of the API (see section 6) | WSS needs a real hostname with a certificate                                                                   |

Alternatives considered:

- Admin on Vercel Hobby: works, but Hobby is non-commercial only and the monorepo needs extra Vercel settings.
  Running it locally only is **not** enough (moderator sign-in and syncing need it).
- Render/Koyeb free web services for the chat-server: they sleep after idle, which drops every connection and makes the
  first visitor wait.

## 3. Phases

### Phase 0 — Repository preparation (done; it needed no account)

Checked locally: the whole production stack was built and started with Docker (images, migrations on start, the seed
through the `tools` profile, `/health`, `/rooms` synced from the admin, the admin login page and a websocket join, all
through Caddy), and the backup script was run against it. Not testable before Phase 1: real certificates, Cloudflare mode,
the deploy workflow.

- [x] 0.1 `docker-compose.prod.yml`: `caddy`, `chat-server`, `admin`, `postgres`, `redis` (append-only), named volumes,
      restart policy, healthchecks, log rotation, nothing published except Caddy's 80/443. An `admin-tools` service
      (profile `tools`) runs one-off jobs such as the seed.
- [x] 0.2 `deploy/caddy/`: `direct.Caddyfile` and `cloudflare.Caddyfile` (chosen with `CADDY_MODE`) sharing
      `sites.caddy`. Direct mode needs `TRUST_PROXY_HOPS=1`; Cloudflare mode trusts Cloudflare's address ranges for the
      client address and needs `TRUST_PROXY_HOPS=2`.
- [x] 0.3 `apps/admin/Dockerfile` rewritten for the monorepo (`output: 'standalone'`, built from the repo root, a `tools`
      target for the seed), and `prodMigrations` so the schema is migrated when the production admin starts.
- [x] 0.4 `apps/web/scripts/pagesHeaders.mjs` (`npm run build:pages --workspace apps/web`) writes `dist/_headers` with the
      policy for the real API address; `pagesHeaders.test.ts` keeps it equal to the nginx config.
- [x] 0.5 `deploy/stack.env.example`, `deploy/chat-server.env.example`, `deploy/admin.env.example`: every setting that
      matters, which are secrets and how to make them. The real files (`deploy/*.env`) are git-ignored.
- [x] 0.6 `deploy/backup.sh` (dump, check that it can be read back, upload to R2 with `rclone`, remove old ones;
      settings in `deploy/backup.env.example`) and `deploy/restore.md` (running stack, scratch test, new machine,
      Postgres upgrade).
- [x] 0.7 `.github/workflows/deploy.yml`: after CI passes on `main`, build `linux/arm64` images on a native ARM runner,
      push them to GHCR, then (once `DEPLOY_HOST` is set) copy the stack files and restart over SSH with the commit's tag.
- [x] 0.8 CI also builds the admin image.

### Phase 1 — Accounts and domain (needs you)

- [x] 1.1 Create the Cloudflare account (Pages now, R2 for backups). No domain yet, so Cloudflare stays out of the way of
      the API (section 6).
- [x] 1.2 Oracle Cloud account (Free Tier, home region Frankfurt) and the instance `chatter`: Ubuntu 24.04 on
      `VM.Standard.A1.Flex` (ARM), 2 OCPU, 12 GB, about 96 GB disk, a new VCN with a public subnet, and an ephemeral public
      IP that stays while the instance exists. (The create form did not give it a public IP; it was added afterwards under
      the VNIC's IP administration.) Logins: `~/.ssh/chatter_oracle` for the `ubuntu` admin user.
- [x] 1.3 R2 is subscribed ($0 until the free limits are passed) and the bucket `chatter-backups` exists (EU
      jurisdiction, private). The API token `chatter-backups-vm` (Object Read & Write, that bucket only) is made, and its two
      keys are in the owner's password manager.
- [ ] 1.4 Create the UptimeRobot account.
- [x] 1.5 DuckDNS names `chatter-drexx-api.duckdns.org` and `chatter-drexx-admin.duckdns.org` (the first choice was
      taken), both pointing at the machine's public IP. DuckDNS fills in the IP of whoever creates a name, so set it to the
      machine's address afterwards. If the public IP ever changes, update both there.

### Phase 2 — Server setup

- [x] 2.1 SSH key login only (no passwords, no root), `unattended-upgrades` on, a 2 GB swap file, and the machine's own
      firewall open for 22, 80 and 443 (`deploy/server-setup.sh`, safe to run again; made for this machine and reusable for
      a fallback VPS).
- [x] 2.2 Docker and the compose plugin installed, and a `deploy` user (Docker group, key-only login with
      `~/.ssh/chatter_deploy`) that owns `/opt/chatter`. The GitHub secrets `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` and the
      variable `DEPLOY_USER` are set. `DEPLOY_HOST` is left unset until Phase 3 has run once by hand: with it set, the deploy
      workflow starts restarting the machine on every push.
- [x] 2.3a Ports 80 and 443 are open in Oracle's default security list (checked from outside with temporary web servers).
- [x] 2.3 DuckDNS names point at the machine's public IP (see 1.5).
- [x] 2.4 `/opt/chatter` is a clone of the public repository (as the `deploy` user; update with `git pull`), and the three
      `deploy/*.env` files were made there with generated secrets (never printed; `chmod 600`).

### Phase 3 — First deployment

In this order, because the chat-server cannot start before the seed has made its key. `COMPOSE` is
`docker compose --env-file deploy/stack.env -f docker-compose.prod.yml`.

- [x] 3.1 `COMPOSE up -d --build postgres redis admin` (the images are built on the machine for now); the admin
      migrated the database as it started.
- [x] 3.2 `bash deploy/seed.sh` runs the seed (first super-admin, sample rooms, the chat-server's service account) and
      writes the service key into `deploy/chat-server.env` without printing it. Still to do by hand: read the super-admin
      password once from `deploy/admin.env` (`SEED_ADMIN_PASSWORD`) into the password manager, then delete the two
      `SEED_ADMIN_*` lines from that file.
- [x] 3.3 `COMPOSE up -d --build`. Checked from outside: `/health`, `/rooms` (the five rooms, synced from the admin),
      the admin login page, a valid Let's Encrypt certificate for both names, and a websocket join.
- [x] 3.4 Deploy the web to Cloudflare Pages from the repository: build command
      `npm run build:pages --workspace apps/web`, output `apps/web/dist`, variables `VITE_CHAT_SERVER_URL=https://<API_HOST>`
      and `VITE_GIPHY_API_KEY`. Done: project `chatter-drexx` (`https://chatter-drexx.pages.dev`), `NODE_VERSION=24`.
      `VITE_GIPHY_API_KEY` is not set yet (no GIF button until it is added and the project is redeployed).
- [x] 3.5 Set `WEB_ORIGIN` in `deploy/chat-server.env` to exactly the Pages origin (no trailing slash) and
      `COMPOSE up -d chat-server`. The guessed value already matched; CORS and the Socket.IO handshake verified.
- [x] 3.6 Smoke test from a phone and a laptop: join a room, two guests chat, reconnect after toggling network, a
      moderator signs in, an `/rooms/<slug>` link works after a reload, GIF search works, no CSP errors in the console.
      Done by the owner (GIF search not applicable until `VITE_GIPHY_API_KEY` is set). Super-admin password saved and
      `SEED_ADMIN_*` removed from `admin.env`.

### Phase 4 — Operations

- [ ] 4.1 Nightly backup job (cron) and **one tested restore** into a scratch database.
- [ ] 4.2 UptimeRobot checks on `/health` and the web address, alert by email.
- [x] 4.3 Log handling: JSON lines go to Docker's log driver with rotation (`max-size`, `max-file`); decide whether a
      free log service is worth it. Rotation is set (5 x 10 MB per service); no log service for now.
- [x] 4.4 A short runbook (`deploy/runbook.md`): restart, roll back to the previous image tag, rotate a secret, restore.
- [x] 4.5 Dependabot or a monthly reminder for base images and `npm audit`. `.github/dependabot.yml`: monthly, npm
      (minor and patch grouped), Dockerfiles, compose images and Actions; the Audit workflow stays.

### Phase 5 — Before real users (hobby launch)

- [ ] 5.1 Terms and privacy text, a contact address for reports, and a rule for how reports are handled.
- [ ] 5.2 A report button with auto-hide and a review list (the safety plan: report, auto-hide after several distinct
      reports, new-account limits, stricter default for private messages).
- [ ] 5.3 Decide on an age rule and say it in the terms.
- [ ] 5.4 Load check: a script that opens a few hundred sockets, to see where the VM and the per-IP cap stand.

### Phase 6 — Later (not started)

- [ ] 6.1 Accounts and saved history (Postgres), password reset email (Resend or Postmark free tier).
- [ ] 6.2 Image uploads to R2 with resize on upload, hash-scan and classifier first, trusted or paying accounts only.
- [ ] 6.3 Move the per-process limits into Redis, then a second chat-server instance becomes possible.
- [ ] 6.4 Move from free tiers to the paid setup when traffic needs it (see section 5).

## 4. Risks

| #   | Risk                                                                             | Mitigation                                                                                                                                      |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Oracle can refuse sign-up, lack ARM capacity, or reclaim an idle free instance   | Keep the Compose file host-independent; fallback VPS of ~EUR 4/month; backups off the VM                                                        |
| R2  | Postgres on the VM means backups and upgrades are ours                           | Nightly dump to R2 (Phase 4.1) and a tested restore; pin the Postgres major version and upgrade by dump and restore                             |
| R3  | A single VM is a single point of failure                                         | Accept for a hobby site; backups and a documented rebuild (Phase 4)                                                                             |
| R4  | Free tiers change terms                                                          | Check before each step; nothing is locked in (plain Docker, plain Postgres)                                                                     |
| R5  | Cloudflare proxying in front of the API changes the client IP seen by the server | Needs a domain. Then `CADDY_MODE=cloudflare` and `TRUST_PROXY_HOPS=2`; test that a forged `X-Forwarded-For` has no effect (not testable before) |
| R6  | Vercel Hobby forbids commercial use                                              | Admin stays on the VM; nothing needs Vercel                                                                                                     |
| R7  | Unmoderated user content                                                         | Phase 5.2 and the safety plan; launch text-only                                                                                                 |
| R8  | Redis loses room history on restart                                              | AOF on the VM; history is short-lived by design (default 1 hour)                                                                                |

## 5. When it outgrows free

Roughly: up to a few hundred concurrent users fits one small VM. Past that, in order: a bigger VM (EUR 5–15), a
managed Postgres, Redis moved out of the VM, then more chat-server instances behind a load balancer once the
per-process limits are in Redis. Rough figures: ~15–50 USD/month at launch scale, ~400–1,000 USD/month around 100k
monthly users.

## 6. Decisions

1. **No domain for now.** The web is on `*.pages.dev`; the API and the admin use DuckDNS names.
2. **Oracle Always Free** for the machine (ARM). The fallback is a small paid VPS.
3. **The admin runs on the same machine** as the chat-server and the database.
4. **Cloudflare in front of the API: yes, but it needs a domain.** Cloudflare can only proxy a name in a zone you own,
   so it cannot sit in front of a DuckDNS name. Until a domain exists the stack runs in `CADDY_MODE=direct`. The day a
   domain is bought (about 10 USD a year, `.dk` about 50 kr): add it to Cloudflare, point `API_HOST` and `ADMIN_HOST` at
   subdomains of it, switch to `CADDY_MODE=cloudflare`, set `TRUST_PROXY_HOPS=2`, and optionally allow only Cloudflare's
   ranges to reach 443. Nothing else changes.

## 7. Carried over from `progress.md`

Items that were still open there and still matter:

- Capacity limits are per process: run one chat-server instance until they move into Redis (Phase 6.3).
- Presence traffic grows with the square of room size; fine for small rooms, needs counts or deltas for large ones.
- Web gaps: typing and unread indicators, little mobile-specific layout work.
- No tests for the Redis-backed sync jobs (`rooms.ts`, `payloadClient.ts` are covered with mocks only).
- A request or socket id on every log line.
- Validation of cached JSON and socket payloads is by type assertion only.
