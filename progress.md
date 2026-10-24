# Progress

The single development checklist, replacing the public roadmap and versions pages. The finished work (features,
the hosting setup, backups, monitoring) is described in the READMEs and in `deploy/`; its history is in git.

Status legend: `[ ]` to do, `[~]` in progress, `[x]` done. Priorities are suggestions, not delivery commitments.

## Small loose ends (owner)

- [ ] Regenerate the DuckDNS token (it was shown once in a tool output).
- [ ] Giphy: the key in use is a development key (limited to about 100 requests an hour). Apply for a production key in
      the Giphy developer dashboard before real users, then replace `VITE_GIPHY_API_KEY` in the Pages settings.
- [ ] Optional: a domain (about 10 USD a year), then Cloudflare in front of the API (see the README, "Decisions").

## Before real users (hobby launch)

- [~] Accounts with Google, Facebook and Discord: built and tested (guest to account from the profile, sign in from the
  nickname dialog and the lobby, nickname reserved, bans follow the account, delete from the profile; a stand-in provider
  for tests). To do: make the three apps at the providers and put their ids and secrets in `deploy/chat-server.env` (see
  "Accounts" in `deploy/runbook.md`), add the account words to the terms and privacy text in the admin and bump the
  terms version. Not done: blocks are still kept in the browser (they follow the account only in that the guest id is
  the same), and signing up without a provider needs an email service.
- [~] Terms and privacy text, a contact address for reports, and a rule for how reports are handled: drafted in English,
  Danish and German, managed in the admin panel (**Terms and privacy**, localized, with drafts; seeded from
  `apps/admin/src/seed/legal/`), shown at `/terms` and `/privacy`, contact `draxxdk@gmail.com` (changeable in the same
  place), report handling in `deploy/runbook.md`. Still to do: have somebody who knows the law read it (it is a draft,
  not legal advice), and run `npm run seed:prod` once after deploying so the text exists in production.
- [x] Age rule: 18 or older, said in the terms and asked for in the nickname dialog (a browser that has not accepted the
      current terms must tick the box). There is no way to verify an age.
- [x] A report button with auto-hide and a review list: done (see the chat-server README, "Reports", and the runbook).
- [ ] Still of the safety plan: new-account limits (what a guest who just arrived may do) and a stricter default for
      private messages (for example, only people who have written in the room, or an accept step).
      Unmoderated content is the biggest risk; launch text-only.
- [x] Load check: `npm run loadtest` (chat-server README, "Load check"). On a laptop, 270 guests with no per-address cap
      were all in within seconds and a message came back in 4 ms (95th percentile). Still to do: run it once against the
      Oracle machine (raise `MAX_CONNECTIONS_PER_IP` for the run) to see where that machine stands.

## Development backlog

- [ ] High: keep mobile sessions connected. Investigate phone locks and app switching on iOS/Android; restore the same
      guest without weakening inactivity or single-session rules.
- [~] High: header and lobby loading. Stable identity/room loading and retry states are implemented; review remaining
  flashes and layout shifts on slow or failed connections before considering this complete.
- [ ] High: review operational logging. Add useful request/connection correlation, retention and alerting; redact
      credentials and personal data, and never log private-message contents.
- [ ] Medium: open person actions from avatars. Provide accessible profile, private-chat, mute, block and report actions
      where permitted, with keyboard, touch, outside-click and Escape support.
- [ ] Medium: write the chat guide for guest/account sign-in, rooms, private messages, notifications, moderation and
      privacy, keeping supported languages aligned with the running site.
- [ ] Medium: document HTTP and socket contracts, authentication, payloads, errors, limits and compatibility; distinguish
      public contracts from internal admin APIs and never publish credentials.
- [ ] Medium: design user-owned rooms with visibility, invitations, capacity and owner moderation; settle persistence,
      lifetime, permissions and abuse prevention before enabling creation.
- [ ] Medium: organize rooms into discoverable subcategories without hiding rooms or occupancy; account for mobile,
      empty categories and user-owned rooms.
- [ ] Medium: voice messages, with explicit microphone permission, recording/preview/delete controls, accessible playback,
      duration/upload limits, storage retention and reporting before enabling them.
- [ ] Explore: dictate into an editable draft without automatically sending. Check language/browser support, show microphone
      state and explain whether audio leaves the device.
- [ ] Explore: evaluate WebRTC only for a concrete chat need; compare signaling, TURN costs, privacy, moderation, mobile
      support and reconnect behavior before committing.
- [ ] Low: evaluate Storybook for shared controls and chat states, including loading/errors, localization, narrow screens,
      keyboard focus, forced colors and visual regressions without duplicating app logic.
- [ ] Low: audit shared hover, pressed, selected, disabled and focus feedback, respecting touch, reduced motion and forced colors.
- [ ] Explore: evaluate a lightweight startup screen only if it improves perceived loading without delaying usable content
      or adding an artificial timer; prioritize ordinary loading-state improvements first.

## Completed development work

- [x] HTTP-client evaluation: retain fetch rather than add Axios without a concrete requirement.
- [x] Frontend framework evaluation: retain React and Vite rather than migrate without a demonstrated benefit.
- [x] Notification sounds: selectable private-message, warning and join sounds, shared volume, previews and saved preferences.
- [x] Typing activity: public rooms and private conversations; private drafts announce only to the intended recipient.
- [x] Replace CMS-backed roadmap/releases with this checklist and git history; remove unused lobby image and generator.

## Later

- [x] Trial TanStack Query for room-list HTTP data while retaining socket-driven updates. Kept the current implementation:
      the prototype added 9.93 kB gzipped without reducing measured request counts or removing update coordination.
      See [Frontend technology evaluation](frontend-evaluation.md).
- [x] Trial TanStack Virtual independently of Query. The bounded-log prototype showed substantial rendering potential,
      but failed keyboard reachability; removed the runtime prototype and retained the regression/profiling workload.
- [x] Adopt TanStack Virtual for all active logs, with full-order keyboard navigation, off-screen search reveal,
      focused-row retention, bottom-follow/scroll anchoring, measured row resizing, selection/copy fallback, and separate
      live announcements. The integrated development workload retains about 85% lower median mount time on desktop and
      mobile. A subsequent threshold comparison favors one ordinary render path despite small-log overhead; the
      arbitrary 80-group cutoff is removed. See the evaluation for measurements, verification, and scope/cost.
- [ ] Verify the virtualized log with NVDA/VoiceOver and profile real production grouping, input responsiveness, and heap
      behavior on a slower mobile device; a large same-author group is not virtualized internally.
- [ ] Accounts and saved history (Postgres), password reset email (Resend or Postmark free tier).
- [ ] Image uploads to R2 with resize on upload, hash-scan and classifier first, trusted or paying accounts only.
- [ ] Move the per-process limits (connection cap, room capacity lock, rate limits) into Redis; then a second
      chat-server instance becomes possible.
- [ ] Move from free tiers to the paid setup when traffic needs it (README, "When it outgrows free").
- [ ] Redis loses room history if its data is lost; it is short-lived by design (default 1 hour) and the append-only file
      covers restarts. Revisit only if history becomes valuable.
