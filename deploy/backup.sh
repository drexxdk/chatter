#!/usr/bin/env bash
# Backs up the Postgres database to Cloudflare R2 (any rclone remote works): a compressed dump, checked before it is
# uploaded, with old dumps removed. Run it from cron on the machine that runs the stack:
#   17 3 * * * bash /opt/chatter/deploy/backup.sh >> /home/deploy/chatter-backup.log 2>&1
# The settings are in deploy/backup.env (see backup.env.example). Restoring is in deploy/restore.md.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a
source deploy/backup.env
set +a

: "${RCLONE_REMOTE:?set RCLONE_REMOTE in deploy/backup.env}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE=(docker compose --env-file deploy/stack.env -f docker-compose.prod.yml)

dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT

# To a file first, so that a dump that failed halfway is never uploaded as if it were a backup.
"${COMPOSE[@]}" exec -T postgres pg_dump -U chatter -Fc chatter >"$dump"

# An empty or damaged dump cannot be listed.
if ! "${COMPOSE[@]}" exec -T postgres pg_restore --list <"$dump" >/dev/null; then
  echo "The dump cannot be read back; nothing was uploaded." >&2
  exit 1
fi

name="chatter-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
rclone copyto "$dump" "$RCLONE_REMOTE/postgres/$name"
rclone delete "$RCLONE_REMOTE/postgres" --min-age "${KEEP_DAYS}d"

echo "Backed up $name ($(wc -c <"$dump") bytes)."
