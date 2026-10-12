# Restoring from a backup

The backups are `pg_dump -Fc` files in the R2 bucket (see `deploy/backup.sh`), under `postgres/`. Redis holds nothing that
has to be restored: the cached rooms and bans are read again from the admin, and room history is short-lived by design.

Run everything from the stack's folder on the machine (for example `/opt/chatter`). `COMPOSE` below is
`docker compose --env-file deploy/stack.env -f docker-compose.prod.yml`.

## Into the running stack (the data was damaged or deleted)

1. Fetch the dump: `rclone ls r2:chatter-backups/postgres` to see them, then
   `rclone copyto r2:chatter-backups/postgres/<name>.dump restore.dump`
   (with the settings of `deploy/backup.env` in the environment: `set -a; source deploy/backup.env; set +a`).
2. Stop what uses the database: `COMPOSE stop admin chat-server`.
3. Replace the contents:
   `COMPOSE exec -T postgres pg_restore -U chatter -d chatter --clean --if-exists --no-owner < restore.dump`
4. Start again: `COMPOSE start admin chat-server`. The chat-server reads rooms and bans from the admin within one sync
   interval (30 seconds by default).
5. Remove `restore.dump`.

## Into a scratch database (a test of the backup; do this once, and again after big changes)

1. `COMPOSE exec postgres createdb -U chatter restore_test`
2. `COMPOSE exec -T postgres pg_restore -U chatter -d restore_test --no-owner < restore.dump`
3. Look at it: `COMPOSE exec postgres psql -U chatter -d restore_test -c "select slug from \"public_rooms\""`
4. `COMPOSE exec postgres dropdb -U chatter restore_test`

## A new machine

1. Set the machine up as in the runbook ("Rebuild on a new machine", steps 1 to 3) and put the `deploy/*.env` files
   back (they are in the password manager, not in the backup).
2. Start only the database: `COMPOSE up -d postgres`, then restore as above (steps 1 and 3).
3. `COMPOSE up -d`. Do not run the seed: the data already has the admin and the service account.

## A newer Postgres major version

Postgres 16 is pinned in `docker-compose.prod.yml`. A newer major version cannot read the old data folder: take a backup,
change the image, remove the `postgres_data` volume, start the new database, and restore the dump into it.
