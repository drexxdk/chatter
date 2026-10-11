#!/usr/bin/env bash
# Runs the seed (first super-admin, sample rooms, the chat-server's service account) and puts the service API key it makes
# into deploy/chat-server.env, so the key is never printed. Run it once from the stack's folder after the admin has started:
#   bash deploy/seed.sh
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose --env-file deploy/stack.env -f docker-compose.prod.yml)
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

"${COMPOSE[@]}" run --rm --build admin-tools >"$log" 2>&1 || {
  # Without the key, in case the failure is about something else.
  grep -v -E '[0-9a-f]{64}' "$log" >&2
  exit 1
}

key="$(grep -oE 'PAYLOAD_SERVICE_API_KEY[^:]*: [0-9a-f]{64}' "$log" | grep -oE '[0-9a-f]{64}$' || true)"

if [ -n "$key" ]; then
  sed -i "s|^PAYLOAD_SERVICE_API_KEY=.*|PAYLOAD_SERVICE_API_KEY=$key|" deploy/chat-server.env
  echo "The service key was written to deploy/chat-server.env."
else
  echo "No new service key (the service account may exist already); deploy/chat-server.env is unchanged."
fi

grep -v -E '[0-9a-f]{64}' "$log" | tail -n 8
