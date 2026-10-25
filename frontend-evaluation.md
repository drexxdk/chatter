# Frontend technology evaluation

Research date: 2026-10-23. These recommendations come from reviewing Chatter's code and the documentation linked below,
plus the Query trial and adopted Virtual integration described below. The rendering measurements are from a
development-browser harness, not a production performance benchmark. Query was removed; Virtual is a runtime dependency.

Recorded bundle sizes, test counts and dependency versions below belong to those dated trials, not the latest build.
They are retained as historical evidence rather than rewritten as current measurements.

## Direction

1. Keep React and the existing Socket.IO architecture.
2. Retain the current room-list implementation. The Query trial did not justify adoption for this feature alone.
3. Use TanStack Virtual for every active message log, with integrated keyboard navigation, off-screen search reveal,
   focus retention, scroll anchoring, and selection. The policy comparison below replaces the initial 80-group cutoff.
4. Keep native `fetch`. Consider WebRTC only when voice, video, or screen sharing becomes a product requirement.

## Trial results: 2026-10-23

### Query: not adopted for rooms

Tested `@tanstack/react-query` 5.104.5 against the real `useRooms` hook, using the existing native `fetchRooms` function.
The prototype used an owner-local QueryClient, infinite stale time, zero cache retention after unmount, and no automatic
retry, window-focus refetch, or network-reconnect refetch. Socket events and returning to the lobby still requested fresh
snapshots. Public room data was the only cached domain; account preferences and live chat were unchanged.

- Production entry: **287.48 kB to 297.41 kB gzipped**, an increase of **9.93 kB**. The lazy chat chunk stayed at 175.84 kB.
- Both implementations made one initial request in the tested flow and no extra request on window focus.
- Both made three requests for the initial snapshot, a pending refresh, and its coalesced follow-up after a burst of
  socket changes. Queued changes also recovered when the pending request failed.
- Initial loading/retry, local language changes, quiet refresh failures, presence gating while chatting, metadata updates,
  reconnects, and unmount cancellation were preserved. The prototype passed the full 95-case room suite, then the added
  queued-failure regression. The final retained implementation passes all 96 cases, including eight refresh tests.
- Query removed some fetch-state/effect bookkeeping, but still needed custom revision coordination to avoid losing
  events during a fetch, including failed requests. It did not reduce request counts in these checks, and a single public
  snapshot owner did not exercise shared-consumer caching benefits.

**Decision:** retain the existing hook and remove Query. This is not a general rejection of Query: reconsider when
multiple HTTP features or consumers can actually share its lifecycle and cache infrastructure. Four new lifecycle
regressions remain in `apps/web/src/App.rooms.test.tsx`.

### Virtual: initial prototype

Trialed independently after the Query decision, using `@tanstack/react-virtual` 3.14.14 and the actual MessageLog and
MessageGroup components. The prototype used `useWindowVirtualizer` above 80 groups, stable group keys, five overscan
groups, an initial 112px height estimate, 8px gaps, window-relative scroll offsets, and measured variable-height list
items. The workload contained 200 distinct-author groups, including an eight-line message every tenth group.

Chromium ran at 1280x720 and 390x700 with 4x CPU throttling. Each variant mounted three fresh component trees per viewport.
Time covers synchronous React mount through two animation frames, not network loading or full application startup.

| Viewport | Baseline samples (ms) | Virtual samples (ms) | Median change                   | Descendant nodes |
| -------- | --------------------- | -------------------- | ------------------------------- | ---------------- |
| Desktop  | 3217, 3691, 3126      | 580, 422, 323        | 3217 to 422 ms, about 87% lower | 2600 to 169      |
| Mobile   | 3541, 3474, 3289      | 517, 295, 303        | 3474 to 303 ms, about 91% lower | 2600 to 117      |

The prototype initially mounted 13 groups on desktop and nine on mobile instead of 200. Its production lazy chat chunk
grew from **175.84 kB to 183.80 kB gzipped**, an increase of **7.96 kB**; the entry chunk was essentially unchanged.
These small-sample development results demonstrate potential, not an established production speedup. Group-level
virtualization also does not help a single very large same-author group; measure real grouping patterns before choosing
the integration granularity.

The identical keyboard check passed with the baseline but failed with Virtual at both viewports: Home could not reach
the unmounted first message, and focus/End recovery was unreliable. At that point, `useRowNavigation` enumerated mounted
DOM nodes. `RoomSearch.choose` also found its target through mounted DOM nodes, so off-screen result reveal needed an
explicit mount-and-focus path; that failure was identified in code, not measured as a separate search benchmark.

**Initial decision:** remove this incomplete runtime prototype, but keep Virtual as a strong follow-up candidate. Its measured
benefit warrants a coordinated list/navigation/search integration, not shipping broken keyboard behavior or claiming
that virtualization has no value. That follow-up must address virtual-index navigation, off-screen search reveal,
focused-row retention, announcements, selection/copy, bottom-follow and scroll anchoring, and late-loading media.
Live bursts, GIF/video resizing, heap usage, input responsiveness, and screen-reader behavior were not measured in this
prototype, so those acceptance criteria remain unverified.

The comparison workload and Home/End regression remain in `apps/web/e2e/chat.spec.ts`. Normal CI runs one unthrottled mount
per viewport. Enable `MESSAGE_LOG_PROFILE=true` for three 4x-throttled samples, metrics, and screenshots. From PowerShell,
the following scopes profiling and the usual automated Turnstile setting to a child process:

```powershell
@'
import { spawnSync } from 'node:child_process';
const result = spawnSync('npm run test:e2e --workspace apps/web -- --grep "bounded message log" --reporter=line', {
  shell: true, stdio: 'inherit',
  env: { ...process.env, MESSAGE_LOG_PROFILE: 'true', E2E_TURNSTILE: 'false' },
});
process.exitCode = result.status ?? 1;
'@ | node --input-type=module
```

This command now profiles the adopted integration. The unvirtualized baseline measurements above were recorded before
the integration; it does not toggle between implementations.

### Virtual: adopted integration

The follow-up integrates `@tanstack/react-virtual` 3.14.22 into the shared room/private MessageLog, using measured
variable-height rows, stable keys, five groups of overscan, and end anchoring. The initial integration activated above
80 groups; the subsequent comparison below replaces that policy. Grouping rules and data-buffer limits are unchanged.

- Keyboard movement uses the full message order rather than mounted DOM order. A shared reveal request mounts an
  off-screen target before navigation or search focuses it. The focused group and current tab stop remain mounted.
- Explicit message-reading requests pause the room's existing bottom-follow observer before mounting/search scrolling,
  preventing it from pulling a reader back to the end. New messages still follow when the reader is at the bottom.
- Height changes above a visible focused message preserve its viewport position. Native drag selection and Select All
  temporarily render all rows; clearing the selection restores virtualization. Touch/programmatic selections use the
  same selection path.
- Virtual rows expose their positions and total count. A separate bounded polite live region announces new messages,
  movements, and announcements without replaying old messages as rows mount. Previously loaded messages do not replay
  entrance animations. Human NVDA/VoiceOver verification remains outstanding.

Re-running the same three-sample, 4x-throttled development workload after integrating these behaviors gave:

| Viewport | Integrated samples (ms) | Median versus baseline          | Descendant nodes | Initially mounted groups |
| -------- | ----------------------- | ------------------------------- | ---------------- | ------------------------ |
| Desktop  | 712, 468, 409           | 3217 to 468 ms, about 85% lower | 2600 to 169      | 13 of 200                |
| Mobile   | 845, 527, 400           | 3474 to 527 ms, about 85% lower | 2600 to 130      | 10 of 200                |

The initial integrated production entry was **287.65 kB gzipped** (+0.17 kB), and the lazy chat chunk was **187.48 kB** (+11.64 kB),
compared with the unvirtualized baseline. These are workload-specific development rendering gains, not a claim of 85%
faster application startup or all conversations. A single large same-author group is not virtualized internally, and
the initial policy left short logs on their original rendering path.

Verification: the full web suite passed all **1,168 tests** during integration, followed by **161 focused tests** on the
final runtime changes. **12 browser checks** passed for real maximum-history rooms, the bounded-log workload, long-history
positioning, search/header scrolling, private navigation/reload/reactions, GIFs, and YouTube. The bounded workload also
passes native Select All after the final test addition. It checks off-screen focus/search, bounded node counts, live
append/trim, a delayed 150px row-height increase, announcements, focused-row retention, and text selection at desktop and
mobile widths. The real-room test uses the supported 200-entry history limit in the isolated E2E server, leaving the
production setting unchanged. Types, touched-file lint, and the production build pass.

**Initial decision:** adopt Virtual for long grouped logs with this coordinated integration. Continue to measure real production
grouping and input/heap behavior, and complete human screen-reader testing; neither production performance nor a real
mobile device was benchmarked here.

### Virtual: always-on versus thresholds

Compared activation above 0, 20, 40, 80, and 1,000 groups using the actual MessageLog/MessageGroup components at
0, 1, 5, 20, 40, 80, and 200 groups. Empty logs contain one placeholder row. Two runs varied policy order; each policy
used three samples at 4x Chromium CPU throttling per desktop/mobile viewport. Mount and one-message append were timed
through two animation frames. The following are mount medians from the second run, in milliseconds:

| Groups | Desktop always-on | Desktop above 80 | Mobile always-on | Mobile above 80 |
| ------ | ----------------- | ---------------- | ---------------- | --------------- |
| 0      | 15                | 11               | 49               | 12              |
| 1      | 44                | 32               | 27               | 15              |
| 5      | 127               | 29               | 108              | 51              |
| 20     | 265               | 132              | 203              | 203             |
| 40     | 183               | 484              | 353              | 419             |
| 80     | 293               | 738              | 217              | 695             |
| 200    | 174               | 220              | 241              | 239             |

Always-on is not free for tiny logs: five-group append medians were 62 versus 36 ms on desktop and 84 versus 65 ms on
mobile. At 40 groups they were 79 versus 403 ms and 190 versus 343 ms, respectively. The improvement can begin before
80 groups, so 80 was not a measured crossover. These small-sample development timings are noisy: at 200 groups both
policies run the same algorithm, yet their medians differ. They do not establish a precise optimal cutoff or a
production responsiveness guarantee. These policy timings precede the final short-log growth and selection fixes;
they are not a benchmark of the exact final revision.

**Decision:** use Virtual for every active log. Accept the small-log overhead to maintain one ordinary rendering path,
remove an arbitrary size boundary, and exercise the same navigation/measurement behavior in everyday conversations.
Selection still temporarily renders all rows, and inactive hidden logs do not virtualize. The measurement engine stays
active during selection so collapsing it cannot briefly unmount the clicked row. Short logs retain bottom alignment,
including when content grows without resizing the containing area.

The temporary comparison prop and alternate-policy harness were removed. The retained browser workload profiles only
the current implementation; the new short-log regression checks empty, one-group, and five-group logs, incremental
growth, bottom padding, and horizontal fit at desktop/mobile widths. Sender selection also asserts that a normal text
click leaves its original row mounted. With always-on enabled, the full web suite passes all **1,168 tests** and the
final **13 browser checks** pass together, covering short/long logs, navigation, search, selection, anchoring, private
conversations, reactions, GIFs, and YouTube. Types, touched-file lint, production build, and repository formatting pass.
The final entry remains **287.65 kB gzipped**; the chat chunk is **187.52 kB**, up 0.04 kB from the threshold integration.
Human screen-reader testing and production/device profiling remain outstanding.

## First trial: TanStack Query

### Why it is worth trying

`apps/web/src/components/Lobby.tsx` currently handles initial loading, refreshes, retry, cancellation, and coordination of
room-list requests. `apps/web/src/legal/useLegal.ts` implements a similar HTTP loading lifecycle, while
`apps/web/src/api.ts` maintains a separate shared authentication-configuration request.

TanStack Query could standardize these responsibilities through query keys, shared caching, request deduplication,
invalidation, and explicit loading/error states. It can call our existing `fetch` functions; Axios is not required.

### Initial scope

- Establish a before/after baseline for room-list requests, loading behavior, bundle cost, and implementation complexity.
- Introduce Query for the room-list HTTP snapshot, keeping the existing public behavior and localized room projection.
- Retain the lobby socket. Use its connection and `rooms:changed` events to refresh or invalidate the room query.
- Preserve the existing distinction between presence changes while away from the lobby and other room changes.
- Pass Query's `AbortSignal` into `fetchRooms` and test cancellation, reconnects, and changes arriving during a fetch.
- Keep live messages, typing, presence, drafts, and connection state in their current socket/domain owners. Do not create
  a second competing chat-state store in the query cache.

### Configuration and safety

- Choose freshness and refetch rules deliberately. Query considers cached data stale by default and can refetch on mount,
  window focus, and network reconnect. Those defaults must not accidentally create unnecessary room-list traffic.
- Configure bounded retries by error category. Do not blindly retry invalid requests, authentication failures, or rate
  limits; respect server retry guidance where available.
- Keep account-specific caches isolated by stable account identity, never by raw bearer tokens. Remove private cached
  data on sign-out or account replacement. Do not persist private query data to browser storage by default.
- If legal content is migrated later, preserve terms-version and acceptance requirements rather than assuming old cached
  terms are always safe to use.
- If account preferences are migrated later, preserve debouncing, ordered writes, stale-response protection, explicit
  retry, and guest localStorage behavior. Query does not automatically serialize mutations or resolve write races.

### Acceptance criteria

- Existing room loading, retry, language, navigation, occupancy, and reconnection tests pass.
- Socket-driven room updates still arrive promptly, including changes during an in-flight request.
- Returning to the lobby does not show indefinitely stale occupancy or introduce unnecessary loading flashes.
- Request counts and bundle changes are recorded, with no unexplained traffic increase.
- The implementation removes meaningful custom lifecycle code without moving equivalent complexity elsewhere.

Start with rooms only. Expand to legal content, authentication configuration, or account reads after the first trial
demonstrates value. Revert the trial if its costs outweigh its benefits.

## Second trial: TanStack Virtual

Virtualization reduces the number of rendered rows; it does not improve HTTP caching or replace pagination. It is a
separate trial and adoption decision from Query. Run the trial whether Query is adopted or rejected. Value can come from
performance, reliability, maintainability, reduced custom code, or capabilities useful to Chatter.

### Trial scope

Profile representative room and private conversations on a slower mobile device or a reproducibly throttled browser.
Include live message bursts, long messages, reactions, GIFs, embedded videos, and a long-running session. Record input
responsiveness, rendering time, DOM size, memory, and scroll behavior before choosing a representative list to prototype.
Compare the prototype with our current implementation for code complexity, reliability, maintenance burden, and support
for expected features as well as performance. Profiling informs the comparison; it is not a prerequisite for trying it.

The current client bounds message/event buffers, so do not assume virtualization will materially help at present limits.

### Acceptance criteria

- The prototype demonstrates concrete value over our current implementation, such as better performance, simpler
  maintenance, less custom code, improved reliability, or useful capabilities. Support performance claims with repeatable
  measurements against the same baseline and workload; a speed improvement is not the only reason to adopt it.
- Variable-height messages and late-loading media do not cause distracting scroll jumps.
- Following new messages, retaining a scrolled-up position, and any history prepending preserve the correct anchor.
- Search results can reveal and focus a message even when its row was not mounted.
- Keyboard navigation, focus retention, selection/copy behavior, and screen-reader announcements remain usable.
- Existing browser tests for scrolling, search, reactions, and message navigation continue to pass.

Adopt only if its benefits to Chatter justify the dependency and any additional measurement, focus, or scroll complexity.
Otherwise retain our current implementation and record why. Neither decision depends on the outcome of the Query trial.

## Should we replace React?

Not on the current evidence. Chatter's web client uses `createRoot` with client-side rendering, not server-rendered
hydration. General comparisons of hydration costs therefore do not directly describe this application's startup.

| Option | Fit for Chatter                                                                                                                          | Recommendation                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Svelte | Compiled components and fine-grained updates make it a credible interactive-app alternative.                                             | Consider a representative prototype only if profiling exposes a problem targeted React improvements cannot address. |
| Solid  | Fine-grained reactivity suits frequent updates. JSX is familiar, but React hooks and components are not directly reusable.               | A possible benchmark candidate, not a migration decision.                                                           |
| Astro  | Particularly suited to content-driven websites and selectively interactive pages. The chat would still require substantial browser code. | Consider for a separate public website or documentation, not as a replacement for the chat client.                  |
| Qwik   | Resumability addresses server-rendered startup costs. Sockets and the editor still require browser initialization.                       | Lower priority for our current architecture.                                                                        |

A migration would involve React-specific UI, hooks, editor integration, and tests. The Payload admin has its own
React/Next.js requirements; replacing the chat frontend would not remove those dependencies.

Treat the article's approximately 1 KB startup and 60-70% bundle-reduction claims as context-specific, not predictions for
the complete Chatter application. Svelte's compilation also does not mean an application has no runtime support code.

## Axios

Keep native `fetch` for now. Axios provides interceptors, shared request configuration, and progress handling, but our API
layer already handles bearer headers, JSON, and domain errors, and `fetch` supports cancellation.

Reconsider if a concrete requirement, such as upload-progress handling or substantial interceptor behavior, makes Axios
simpler than the existing approach. TanStack Query and Axios solve different problems and do not need to be adopted
together. Neither Axios nor TypeScript annotations validates response data at runtime.

## WebRTC

Investigate when adding voice, video, or screen sharing. It is not a useful replacement for server-mediated text chat,
history, or moderation.

Production calling needs signaling, STUN/TURN connectivity, permissions, reconnect handling, and bandwidth budgeting.
Direct peer connections can expose participants' public IP addresses, which matters for guest chat. Relay policy and
consent should be explicit product decisions.

For group calls, evaluate an established media platform such as LiveKit and its selective forwarding unit (SFU), rather
than building a peer-to-peer mesh ourselves. Keep text messaging on the existing server architecture.

## Other worthwhile investigations

- **React Compiler:** evaluate incremental adoption after profiling. Automatic memoization may reduce unnecessary
  rendering without a framework migration; it will not fix every performance problem.
- **Runtime schemas:** compare Zod or Valibot with handwritten API/socket parsers at a small shared boundary before
  considering broader adoption.
- **Observability:** evaluate privacy-filtered error reporting and HTTP/socket metrics, including reconnect failures,
  delivery latency, and slow operations. Do not collect message bodies, tokens, or personal profile data by default.
- **Accessibility automation:** consider automated checks alongside keyboard and screen-reader testing, particularly
  before virtualizing message lists.
- **Dependency security:** resolve the installed Next.js security warning independently of these trials. Moving the chat
  client to another UI framework would not remediate the admin application's dependency.

## Sources

- [Original framework comparison article](https://dev.to/kouta222/the-next-big-things-in-frontend-svelte-astro-qwik-solid-2025-edition-2fnf)
- [Svelte overview](https://svelte.dev/docs/svelte/overview)
- [Solid reactivity](https://docs.solidjs.com/concepts/intro-to-reactivity)
- [Astro design and use cases](https://docs.astro.build/en/concepts/why-astro/)
- [Qwik resumability](https://qwik.dev/docs/concepts/resumable/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction)
- [Axios](https://axios.rest/)
- [WebRTC peer connections and signaling](https://webrtc.org/getting-started/peer-connections)
- [WebRTC TURN servers](https://webrtc.org/getting-started/turn-server)
- [LiveKit SFU architecture](https://docs.livekit.io/reference/internals/livekit-sfu/)
- [React Compiler](https://react.dev/learn/react-compiler)
