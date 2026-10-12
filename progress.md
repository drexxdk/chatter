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

- [ ] Terms and privacy text, a contact address for reports, and a rule for how reports are handled.
- [ ] A report button with auto-hide and a review list (the safety plan: report, auto-hide after several distinct
      reports, new-account limits, stricter default for private messages). Unmoderated content is the biggest risk;
      launch text-only.
- [ ] Decide on an age rule and say it in the terms.
- [ ] Load check: a script that opens a few hundred sockets, to see where the machine and the per-IP cap stand.

## Later

- [ ] Accounts and saved history (Postgres), password reset email (Resend or Postmark free tier).
- [ ] Image uploads to R2 with resize on upload, hash-scan and classifier first, trusted or paying accounts only.
- [ ] Move the per-process limits (connection cap, room capacity lock, rate limits) into Redis; then a second
      chat-server instance becomes possible.
- [ ] Move from free tiers to the paid setup when traffic needs it (README, "When it outgrows free").
- [ ] Redis loses room history if its data is lost; it is short-lived by design (default 1 hour) and the append-only file
      covers restarts. Revisit only if history becomes valuable.
