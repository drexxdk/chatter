# Runbook

Run on the machine as `deploy`, from `/opt/chatter`. `COMPOSE` is
`docker compose --env-file deploy/stack.env -f docker-compose.prod.yml`.

## Is it up?

- `curl -fsS https://<API_HOST>/health` and `https://<ADMIN_HOST>/admin/login`.
- `COMPOSE ps` shows every service as running (postgres and redis as healthy).
- `COMPOSE logs --tail 100 chat-server` (or `admin`, `caddy`). Logs rotate at 5 x 10 MB per service.

## Restart

- One service: `COMPOSE restart chat-server`. Restarting the chat-server drops every socket; clients reconnect on their own.
- Everything: `COMPOSE up -d`. After a reboot the services come back by themselves (`restart: unless-stopped`).

## Roll back to the previous version

Images are tagged with the commit SHA (`TAG` in `deploy/stack.env`).

1. Find the SHA to go back to (the Deploy runs in GitHub Actions, or `git log`).
2. `sed -i "s/^TAG=.*/TAG=<sha>/" deploy/stack.env`
3. `COMPOSE pull chat-server admin && COMPOSE up -d`

The admin runs pending migrations when it starts and never undoes them. If the bad release added a migration, restore
the last backup instead (`deploy/restore.md`) after rolling the images back.

## Change a setting or rotate a secret

1. Edit the file in `deploy/` (`chat-server.env`, `admin.env`, `stack.env`). They are `chmod 600`.
2. `COMPOSE up -d <service>` recreates the service with the new value.

Notes per secret:

- `WEB_ORIGIN` must be exactly the web address, no trailing slash. Changing the web address means changing it here too.
- `AUTH_TOKEN_SECRET`: changing it signs every guest out of their saved session.
- `BAN_HASH_SALT`: changing it makes existing bans stop matching. Do not rotate unless the salt leaked.
- `PAYLOAD_SECRET`: changing it signs every admin out.
- `PAYLOAD_SERVICE_API_KEY`: delete the admin whose role is `service` in the admin panel, run `bash deploy/seed.sh`
  (it makes a new one and writes the key into `chat-server.env` without printing it), then `COMPOSE up -d chat-server`.
- Database password: change it in `stack.env`/`admin.env` and with `ALTER USER` in Postgres, then recreate `admin`.
- DuckDNS token and R2 keys live outside the repo (the provider dashboards and the vault); rotate there, then update
  `deploy/backup.env` for R2.

## Backups and restore

- Nightly: cron runs `bash /opt/chatter/deploy/backup.sh` (settings in `deploy/backup.env`).
- Restore, scratch test and a rebuild on a new machine: `deploy/restore.md`.

## Disk or memory is full

- `df -h`, `docker system df`. Free space with `docker image prune -f` (unused images) first.
- `COMPOSE logs` rotation keeps logs bounded; the Postgres volume and the Redis append-only file are what grow.

## Rebuild on a new machine

For a replacement machine, or the very first setup:

1. Ubuntu with SSH key login. Copy `deploy/server-setup.sh` over and run it with sudo (the command is in the script's
   header). It makes the `deploy` user, Docker, rclone, swap and the firewall, and is safe to run again. Open ports 22, 80
   and 443 in the provider's own firewall too.
2. Point the two DuckDNS names (`API_HOST`, `ADMIN_HOST`) at the new public IP.
3. As `deploy`: clone the repository to `/opt/chatter` and make the `deploy/*.env` files from their `.example` files
   (`stack.env`, `chat-server.env`, `admin.env`, `seed.env`, `backup.env`; generate the secrets, `chmod 600`; the old ones
   are in the password manager).
4. A new, empty database: `COMPOSE up -d postgres redis admin`, then `bash deploy/seed.sh` (it creates the first
   super-admin from `seed.env` and writes the service key into `chat-server.env`). From a backup instead: restore it and
   do not seed (`deploy/restore.md`, "A new machine").
5. `COMPOSE up -d`. Check `/health`, `/rooms` and `/admin/login` from outside.
6. Update `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` in GitHub, put the cron line from `deploy/backup.sh` back, and make sure
   `WEB_ORIGIN` matches the web address.
