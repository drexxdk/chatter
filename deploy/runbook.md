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
2. `COMPOSE up -d --force-recreate <service>` recreates the service with the new value (plain `up -d` leaves a running
   container alone when only the env file changed).

For `chat-server.env` there is a shortcut from your own machine: edit the copy in `deploy/` there (not committed), then
`npm run env:push`. It adds or replaces each setting that has a value in your copy, backs the old file up as
`chat-server.env.bak`, recreates the chat-server and prints `/auth/providers`. It never prints values, refuses an
`.example.` value, and never wipes `PAYLOAD_SERVICE_API_KEY`, `BAN_HASH_SALT` or `AUTH_TOKEN_SECRET` with an empty one.
Settings missing from your copy are left alone; `-- --restart` recreates even when nothing changed.

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

## Reports

Guests report a message from the "…" menu of a message. Three different addresses (`REPORT_HIDE_THRESHOLD`) hide it for
everybody; a moderator's report hides it at once. Each reported message is kept in the admin panel under **Reports**
(text, nickname, reasons, how many reported it), deleted after `REPORT_RETENTION_DAYS` (90) days.

- Review: open **Reports** in the admin panel, read the message, and set the status: _Dismissed_ (nothing wrong) or
  _Actioned_ (you dealt with it). New reports are _Open_ (still visible) or _Hidden_ (hidden for everybody).
- Ban the sender: copy `senderHash` into a new entry under **Bans** (set an expiry, or leave it empty for permanent). The
  ban reaches the chat within `SYNC_INTERVAL_MS` and replaces that sender's remaining messages. The hash is of their
  address, so it also covers anybody sharing it.
- A report with an empty `senderHash` was about a moderator's message.
- Where reports go to is the contact address in the terms (see "Terms and privacy" below): answer it, and delete a report from the
  admin panel earlier than the retention period when somebody asks for it.

## Accounts (Google, Facebook, Discord)

Guests can make an account by connecting one of the three; how it works is in the chat-server README, "Accounts". Each
provider needs an app that only you can make, which gives an id and a secret. The address people are sent back to is the
same form for all, with the chat-server's public address (`PUBLIC_API_URL`, for example
`https://chatter-drexx-api.duckdns.org`): `<PUBLIC_API_URL>/auth/google/callback`, `/auth/facebook/callback` and
`/auth/discord/callback`.

1. **Google**: in the Google Cloud console, make a project, set up the OAuth consent screen (external; the app's privacy
   policy is `<web address>/privacy`, and it must be published, not left in testing, for everybody to use it), then
   Credentials > Create OAuth client ID > Web application with the redirect address above. The scopes are `openid`,
   `email` and `profile`.
2. **Facebook**: at developers.facebook.com make an app with the "Facebook Login" product, put the redirect address in
   its valid OAuth redirect URIs, and add the privacy policy address. The permissions are `public_profile` and `email`
   (both need no review), but the app has to be switched to live mode for people other than its own testers.
3. **Discord**: in the Discord developer portal make an application, add the redirect address under OAuth2. The scopes
   are `identify` and `email`.
4. Put `PUBLIC_API_URL` and the pair of each provider you made in `deploy/chat-server.env` (see the example), then
   `COMPOSE up -d chat-server`. Check `https://<API_HOST>/auth/providers`: it lists the ones that are on, and the website
   shows their buttons by itself. Only a provider with both of its settings is on.

People with an account are in the admin panel under **Users** (provider, email, nickname). To remove one, delete the entry:
the next successful account sync frees the cached nickname and disconnects anybody signed in as that account. It runs
every ten `SYNC_INTERVAL_MS` intervals (five minutes by default). A failed Payload fetch never revokes access based on
an incomplete account list. Guests who delete their own account from their profile do the same at once. To ban an account, copy the
`senderHash` of one of its reported messages in **Reports** into **Bans**: for an account it is the hash of the account,
so the ban follows it from any address.

The terms and the privacy policy mention accounts (what is kept, at the services, deleting it). A database that was seeded
before that needs the same words added in the admin under **Terms and privacy**, in all three languages, and a new
**Terms version** so everybody accepts again; the text is in `apps/admin/src/seed/legal/` (the sections "Accounts" and
the lines about accounts in the privacy policy).

## Terms and privacy

The text of the terms of use and the privacy policy is in the admin panel under **Globals > Terms and privacy**, in
English, Danish and German (switch the language at the top of the form). Sections have a heading, paragraphs (separate
them with an empty line; `{contact}` becomes the contact address as a link) and optionally a list (one item per line).
A language is shown only when both documents are complete in it; others see English.

- Saving as a draft changes nothing for guests; **Publish** does. The chat-server picks it up within `SYNC_INTERVAL_MS`,
  and browsers may keep the old text for up to a minute.
- Change **Terms version** (any text, for example a date) only when the change matters: every guest is then asked to
  accept again. Fixing a typo does not need it.
- The first time (a database that has never been seeded, such as production after this was deployed), wait for the
  deploy to finish (the admin applies the migrations when it starts) and run `npm run seed:prod` on your computer. It
  resets the checkout on the machine to `origin/main` and runs `bash deploy/seed.sh` there over SSH as `deploy`, to the
  API's DuckDNS name (`DEPLOY_HOST`, `DEPLOY_USER` and `DEPLOY_SSH_KEY_FILE` change that). The seed adds the draft text
  that is in `apps/admin/src/seed/legal/` and leaves everything that exists alone. Until then `/legal` answers 404 and
  the terms pages say they cannot be loaded.
- The draft is plain-language and not legal advice; have somebody who knows the law read it.

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
