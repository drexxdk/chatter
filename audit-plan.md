# Codebase Improvement Plan

Source audit completed on 2026-10-18. Priorities below distinguish immediate fixes
from changes that need database migrations or broader integration work.

## 1. Account Name Ownership

- [x] Serialize registration, profile renames, deletion, and reserved-name cache
      synchronization in the current single-chat-server deployment.
- [x] Recheck name ownership inside the serialized profile write.
- [x] Add regressions for overlapping registrations, cross-column rename
      conflicts, and synchronization during a mutation.
- [x] Enforce the shared normalized username/display-name namespace in the
      database, transactionally, across every writer, using unique claims saved
      with each user.
- [x] Make cache-claim failure recovery explicit rather than silently accepting
      failed claims after database writes.
- [x] Derive normalized name keys at the Payload write boundary so admin edits
      cannot leave stale keys. Stop the admin watcher before schema changes and
      validate migrations against an isolated database.

## 2. Account Lifecycle and Profile Concurrency

- [x] Revoke existing member connections after account deletion through admin,
      not only self-service deletion.
- [x] Serialize profile updates per account/socket, reserve rate-limit capacity
      before asynchronous work, and avoid overwriting newer partial updates with
      stale snapshots.
- [x] Share profile validation and mutation behavior between REST and sockets.

## 3. Reliable E2E Input

- [x] Replace multiline contenteditable `.fill()` with a shared paste or
      Shift+Enter helper. The one-paragraph TipTap schema drops subsequent lines
      from the block elements produced by `.fill()`.
- [x] Assert the complete sent fixture before testing image-URL exclusion or
      multiline layout.
- [x] Consolidate repeated public/private composer helpers.

## 4. Message Presentation

- [x] Share canonical private-message participant metadata between chat and
      search, including renamed participants.
- [x] Share bubble variants and presentation selectors without coupling search
      controls to timeline interaction state.

## 5. Contracts and Module Boundaries

- [x] Share selected event names, payload contracts, and validation rules; retain
      the existing client/server parity tests.
- [ ] Extract domain handlers from `socket.ts`, starting with account/profile
      mutations rather than splitting files solely by size.
- [ ] Separate room, direct-message, and account responsibilities in `useChat`
      where ownership and integration tests are clear.

## Verification and Delivery

- Run focused regressions after each behavioral change, then relevant type,
  lint, and formatting checks.
- Keep each fix scoped; do not mix unrelated refactors with correctness changes.
- Do not apply production migrations, commit, or push without a separate request.
- Record completed work and remaining limitations below.

## Progress

- 2026-10-18: Added a shared account-name mutation queue covering registration,
  sign-in cache repairs, profile writes, self-service deletion, and cache refresh.
  Refreshes do not overlap or build an unbounded backlog while one is pending.
- Added ownership rechecks inside profile writes and regressions for swapped-name
  registrations, registration versus rename, slow refreshes, queue ordering, and
  recovery after failed operations.
- Verification: chat-server suite passed with 842 tests; 15 Redis integration
  tests were skipped. Server typechecking, lint, and scoped formatting passed.
- 2026-10-18: Added database-enforced ownership through a hidden unique name-claim
  array. Payload derives normalized keys and claims for admin and API writes;
  conflicting writes roll back together. Migration backfill uses its own SQL
  transaction and does not depend on future collection definitions.
- Added PostgreSQL coverage for concurrent swapped-name registrations, conflict
  rollback, partial updates, rename/delete claim cleanup, and legacy backfill.
  The PostgreSQL CI job now runs these tests. Shared-name conflicts retain the
  existing chat API's username/display-name error responses.
- At the user's request, deleted and recreated the local development database,
  applied all nine migrations, and reseeded defaults. Retained the existing
  chat-server service key; no data-copy or backup workflow was used.
- Verification: 11 Payload ownership tests and 129 chat-server API/account tests
  passed. Both backend typechecks and lint passed; the migration drift check
  found no differences. Live HTTP checks confirmed service authentication,
  username/display-name conflicts, and the chat room API after restart.
- Production: deployed the matching backend code and applied the name-claim
  migration. Both services were healthy; the unique index, backfilled claims,
  live account conflicts, and public API were verified. No production reset was
  needed. The ownership changes were subsequently committed and pushed as
  `a8830a1`.
- Cache recovery: registration, sign-in repairs, renames, and deletion now share
  explicit error handling. Failed claims (including stale ownership) or releases
  trigger an immediate database-backed rebuild. A failed rebuild is logged and
  the periodic sync retries; successfully persisted writes remain successful.
- Added five cache recovery regressions; all 437 focused cache/account/socket
  tests passed. Avatar-only profile changes still avoid name-cache writes.
- 2026-10-19: Committed cache recovery as `9786706` (not pushed). Continued with
  account-deletion revocation through the existing account sync. A complete
  successful Payload snapshot now disconnects signed-in members whose accounts
  were removed, including accounts deleted in admin. Guests and existing members
  are unaffected, and room presence updates through the normal disconnect path.
- Added regressions for deletion snapshots, failed Payload fetches, Redis-write
  failure, enforcement failure isolation, socket revocation, and presence updates.
  Revocation runs every ten sync intervals; self-service deletion remains
  immediate. No schema change or migration is required for this follow-up.
- Remaining: Redis is still a derived cache. Prompt propagation of admin changes
  and multi-server coordination of live connections remain separate follow-up
  work; database account ownership no longer depends on Redis or the
  process-local queue. The cache-recovery and revocation follow-ups are not yet
  deployed.
- 2026-10-19: Committed deletion revocation as `c7fc8d9` (not pushed). Profile
  mutations now share a per-account queue across REST and sockets; guest profile
  edits serialize per socket. Each member edit reads the current persisted
  profile inside the queue before merging partial changes.
- Socket profile requests reserve rate-limit capacity before asynchronous work
  or queueing. Failed edits release their reservations; successful edits retain
  the existing sliding-window quota. Disconnected sockets skip queued edits.
- Added deterministic regressions for overlapping socket and HTTP edits,
  in-flight quota accounting, failed-validation refunds, and profile values
  saved by another client. All 862 server tests passed; 15 Redis integration
  tests were skipped. Server typechecking, lint, and scoped formatting passed.
- Profile concurrency remains process-local, matching the current single-server
  deployment; cross-node coordination remains separate work. Committed profile
  concurrency as `6605c1b` (not pushed or deployed).
- 2026-10-19: REST and socket profile edits now share one partial-profile merge
  and validator alongside the existing shared persistence function. Nickname,
  avatar, picture, age, name ownership, and unavailable-name handling use the same
  rules. Transport-specific HTTP statuses, socket acknowledgements, room-name
  checks, rate limits, and serialization remain at their existing boundaries.
- Added 40 shared-validation cases covering omitted fields, explicit nulls,
  valid boundaries, atomic rejection, guest/member name checks, and unavailable
  dependencies. All 902 server tests passed; 15 Redis integration tests were
  skipped. Server typechecking, lint, and scoped formatting passed.
- Shared-profile validation was committed as `da2869c` and pushed together with
  the earlier cache, revocation, and concurrency commits. Deployment status was
  not rechecked here.
- 2026-10-19: Committed people-dropdown focus and scrollbar fixes as `4207b6b`
  (not pushed). The mobile people panel uses the standard non-modal popover with
  search focus, Escape, outside-click dismissal, and focus return; it no longer
  locks page scrolling. Real modals still lock scrolling; emoji pickers do not.
- Reliable E2E input: one composer helper inserts text and Shift+Enter hard
  breaks, then checks the complete editor content before sending. It ignores
  only ProseMirror's presentation-only trailing break. Public/private send
  helpers are consolidated, and announcement/picker fixtures reuse the input
  helper. This follow-up changes tests, not application behavior.
- Search regressions now verify both public and private GIFs arrived before
  checking URL exclusion. The layout regression verifies the entire delivered
  multiline fixture, including its blank line, before checking geometry.
- Verification: all 37 chat browser tests passed, including search/layout at
  mobile and desktop sizes, private messaging, reloads, GIF/emoji pickers, and
  announcements. Web typechecking, lint, and scoped formatting passed.
- 2026-10-19: Committed E2E input fixes as `d940d5a` (not pushed).
- Private-message presentation: the room timeline and search now use one shared
  projection of private messages and their current conversation partner. Search
  no longer displays stale incoming names, avatars, or pictures, and outgoing
  recipient labels follow the same current partner as the timeline. Private
  messages are searchable by sender or recipient name. Stored message snapshots
  and public-message metadata remain unchanged.
- Added a regression for renamed participants, avatar changes, removed pictures,
  and name searches in both directions. Shared-projection tests cover block
  notices, ban placeholders, historical snapshots, and chronological insertion.
  All 147 room/direct-message tests and the mobile/desktop search browser
  regression passed. Web typechecking, lint, and scoped formatting passed.
- Committed private-participant metadata as `0d53a57` (not pushed or deployed).
- Bubble presentation: chat and search now share variant precedence, bubble
  colors, label colors, and side selection. Both expose the same
  `data-message-variant` selector. Private styling takes precedence over moderator
  styling, which takes precedence over sent/received styling. Geometry, GIF
  wrappers, banned-message overrides, and interaction state remain local.
- Added eight appearance cases and integration assertions comparing actual chat
  and search rows. The focused room/private-message run passed 96 tests; one
  composer draft-clear timing failure passed on an isolated rerun. The browser
  search regression passed at mobile and desktop widths. Web typechecking and
  lint passed.
- Committed shared bubble presentation as `36a7be1` (not pushed or deployed).
- Shared contracts: `shared/chatProtocol.mjs` and its TypeScript declarations
  now own message-length and name-validation rules, the `profile:update` event,
  and profile request/reply types. Existing client/server import surfaces remain
  available. The client uses the shared partial-update type; the server checks
  its replies against the shared acknowledgement type while still validating
  unknown input at runtime.
- Retained all client/server parity checks, added shared avatar-type checks, and
  pinned the existing message-length and profile-event boundaries independently
  of their shared implementations. Other age, picture, avatar, and reaction
  constants remain local with parity coverage; this is a selected-contract
  extraction, not a wholesale protocol rewrite.
- Verification: 171 focused validation, profile-dialog, and socket tests passed.
  Both applications passed typechecking and lint. Both production container
  images built successfully, and a non-root runtime probe imported the compiled
  server's shared protocol module successfully.
- Shared-contract changes remain uncommitted and undeployed. Extracting account
  and profile handlers from `socket.ts` is next; `useChat` domain separation also
  remains outstanding.
