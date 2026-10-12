# Progress

What is left. The finished work (features, the hosting setup, backups, monitoring) is described in the READMEs and in
`deploy/`; its history is in git.

Status legend: `[ ]` to do, `[~]` in progress.

## Small loose ends (owner)

- [ ] Regenerate the DuckDNS token (it was shown once in a tool output).
- [ ] Giphy: the key in use is a development key (limited to about 100 requests an hour). Apply for a production key in
      the Giphy developer dashboard before real users, then replace `VITE_GIPHY_API_KEY` in the Pages settings.
- [ ] Optional: a domain (about 10 USD a year), then Cloudflare in front of the API (see the README, "Decisions").

## Before real users (hobby launch)

- [~] Terms and privacy text, a contact address for reports, and a rule for how reports are handled: drafted in English,
  Danish and German, managed in the admin panel (**Terms and privacy**, localized, with drafts; seeded from
  `apps/admin/src/seed/legal/`), shown at `/terms` and `/privacy`, contact `draxxdk@gmail.com` (changeable in the same
  place), report handling in `deploy/runbook.md`. Still to do: have somebody who knows the law read it (it is a draft,
  not legal advice), and run `npm run seed:prod -- <host>` once after deploying so the text exists in production.
- [x] Age rule: 18 or older, said in the terms and asked for in the nickname dialog (a browser that has not accepted the
      current terms must tick the box). There is no way to verify an age.
- [x] A report button with auto-hide and a review list: done (see the chat-server README, "Reports", and the runbook).
- [ ] Still of the safety plan: new-account limits (what a guest who just arrived may do) and a stricter default for
      private messages (for example, only people who have written in the room, or an accept step).
      Unmoderated content is the biggest risk; launch text-only.
- [x] Load check: `npm run loadtest` (chat-server README, "Load check"). On a laptop, 270 guests with no per-address cap
      were all in within seconds and a message came back in 4 ms (95th percentile). Still to do: run it once against the
      Oracle machine (raise `MAX_CONNECTIONS_PER_IP` for the run) to see where that machine stands.

## Later

- [ ] Accounts and saved history (Postgres), password reset email (Resend or Postmark free tier).
- [ ] Image uploads to R2 with resize on upload, hash-scan and classifier first, trusted or paying accounts only.
- [ ] Move the per-process limits (connection cap, room capacity lock, rate limits) into Redis; then a second
      chat-server instance becomes possible.
- [ ] Move from free tiers to the paid setup when traffic needs it (README, "When it outgrows free").
- [ ] Redis loses room history if its data is lost; it is short-lived by design (default 1 hour) and the append-only file
      covers restarts. Revisit only if history becomes valuable.
