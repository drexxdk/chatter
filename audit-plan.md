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
- [ ] Make cache-claim failure recovery explicit rather than silently accepting
      failed claims after database writes.
- [x] Derive normalized name keys at the Payload write boundary so admin edits
      cannot leave stale keys. Stop the admin watcher before schema changes and
      validate migrations against an isolated database.

## 2. Account Lifecycle and Profile Concurrency

- [ ] Revoke existing member connections after account deletion through admin,
      not only self-service deletion.
- [ ] Serialize profile updates per account/socket, reserve rate-limit capacity
      before asynchronous work, and avoid overwriting newer partial updates with
      stale snapshots.
- [ ] Share profile validation and mutation behavior between REST and sockets.

## 3. Reliable E2E Input

- [ ] Replace multiline contenteditable `.fill()` with a shared paste or
      Shift+Enter helper. The one-paragraph TipTap schema drops subsequent lines
      from the block elements produced by `.fill()`.
- [ ] Assert the complete sent fixture before testing image-URL exclusion or
      multiline layout.
- [ ] Consolidate repeated public/private composer helpers.

## 4. Message Presentation

- [ ] Share canonical private-message participant metadata between chat and
      search, including renamed participants.
- [ ] Share bubble variants and presentation selectors without coupling search
      controls to timeline interaction state.

## 5. Contracts and Module Boundaries

- [ ] Share selected event names, payload contracts, and validation rules; retain
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
- Remaining: Redis is still a derived cache. Immediate cache-failure recovery,
  prompt propagation of admin changes, and multi-server coordination of live
  connections remain separate follow-up work; database account ownership no
  longer depends on Redis or the process-local queue.
