# Proposed delivery roadmap

**Status:** Proposal for review, 2026-10-12. This document tracks the current baseline and suggested PR sequence. It does not change decisions in [DECISIONS.md](DECISIONS.md). Accepted choices go there; unresolved choices stay in [HOT_TOPICS.md](HOT_TOPICS.md).

## Where the project stands

- The accepted architecture is a game-independent Next.js catalog, lobby, and table. The host browser owns authoritative state; guests receive player-specific snapshots. WebRTC carries table traffic; AWS Lambda Function URL and DynamoDB Standard provide thin coordination. Timers and dedicated-server authority are deferred.
- Shared protocol schemas, the game SDK, engine, decision-provider adapters, table data models, and a provider-neutral coordination service exist. `npm run check` passed on 2026-10-12: type checking, 35 tests, and schema freshness.
- M0 is incomplete: `apps/web` has no application or catalog/lobby/table routes. M1 has substantial code but needs an acceptance review and game registration. M2 has table data models but no React visuals or interaction controls. M3 has capability-bound room membership and signaling in the provider-neutral coordination service, but no HTTP/AWS adapter, browser lobby, WebRTC transport, or complete playable flow. M4 has provider adapters but no rendered human controls.
- The 2026-10-05 interface-foundation plan intentionally built parts of later milestones before the M0 browser shell. This roadmap returns to the documented milestone order without discarding that work.

### Acceptance review

| Milestone | Criteria already demonstrated | Remaining acceptance work |
| --- | --- | --- |
| M0 | Repository guidance and planned package boundaries | Next.js/React app with distinct catalog, lobby, and table destinations; verify every boundary exists as a usable package. |
| M1 | Typed game definition, strategies, engine turn/barrier orchestration, runtime decision schemas | Add and exercise game registration; review the complete criteria with a registered fixture game. |
| M2 | Renderer-neutral table data contract | Visual components, shared selection/zoom/animation behavior, and a game-composed layout. |
| M3 | Provider-neutral room/signaling service, server-assigned room member IDs, and capability-bound mutations and signal polling | HTTP/AWS coordination, browser lobby, WebRTC host/guest flow, and end-to-end projection checks. |
| M4 | Correlated human/bot submission adapters and engine validation | Render human controls and demonstrate both immediate and waiting decisions through a playable flow. |
| M5 | Portability is a design constraint | Dedicated authority, recovery, timers, and operational readiness remain deferred. |

Tests are co-located with source as `*.test.ts`; the test runner discovers them under `packages` and `services`. Each test file starts with a comment stating the covered behavior. This keeps contract examples next to the small module they cover; a separate `tests/` tree is also valid, but would not improve this repository's current boundaries.

## Small reviewable PRs

| PR | Deliverable and review proof | Depends on | Track |
| --- | --- | --- | --- |
| 0. Baseline and contract audit | Align package boundaries and `CONTRACTS.md` with the code; check M1/M4 acceptance criteria; record which open topics the implementation already resolves. Keep any contract fixes focused and tested. | Current code | Shared, first |
| 1. Web shell | Create the Next.js workspace and distinct catalog, lobby, and table routes using fixture data. Run the full check suite plus a web build. This closes M0 when all its criteria pass. | PR 0 interface ownership | Web |
| 2. Game registration | Define a typed game manifest/registry and catalog lookup. Add a tiny test game fixture to prove registration, engine turns, and player projection without shaping platform APIs around it. | PR 0 | Framework |
| 3. Coordination identity | Define room/player capabilities and bind every room mutation and signal poll to the caller. Test impersonation and unauthorized polling. | PR 0 | Coordination |
| 4. Table primitives | Render existing table models as reusable card, token, board, and action components, with selection and zoom hooks. Use fixture snapshots and typed submission callbacks; keep game rules out of React. | PR 0; can overlap PRs 2 and 3 | Visual |
| 5. Atomic rooms | Make room creation, joining, and leaving conditional repository operations. Test simultaneous joins at capacity and duplicate requests. | PR 3 | Coordination |
| 6. Room lifecycle | Define start/close and abandoned-room expiry, plus server-owned signal ordering and cleanup. Test stale rooms and cursor behavior. | PR 5 | Coordination |
| 7. Coordination HTTP | Add a thin HTTP entry point and local/test repository with bounded requests and typed errors. | PR 6 | Coordination |
| 8. AWS adapter | Add a DynamoDB repository, Lambda Function URL configuration, and usage bounds. Verify the adapter against the same repository contract before deployment. | PR 7 | Coordination |
| 9. Browser lobby and transport | Connect catalog/lobby routes to coordination; add WebRTC signaling and data-channel adapters behind interfaces. Bind peer identity to submissions and send only per-player snapshots. | PRs 1, 2, 3, 7, 8 | Integration |
| 10. First playable table | Compose one small game layout using shared visuals and complete a two-browser host/guest turn. Test rejection of stale/foreign responses and absence of hidden data in guest messages. | PRs 2, 4, 9 | Integration |

PRs 1, 2, and 3 can start after PR 0 on separate branches. PR 4 can start from the current table model with fixtures and should agree on its registration/layout boundary with PR 2 before integration. The coordination PRs then advance sequentially from 3 through 8. PRs 9 and 10 are integration gates and should be sequential. Merge small PRs frequently so branches do not carry divergent shared contracts.

## Decisions to settle at the relevant PR

1. **PR 0/2:** Game manifest and registration shape; whether current decision/version schemas fully close the protocol hot topic; how layouts register without coupling the SDK to React.
2. **PRs 3, 5, and 6:** Guest authorization and caller identity; atomic room writes; signal ordering, room expiry, and host-loss behavior for the first playable session.
3. **PR 4:** Shared component API and styling/animation choices, driven by the fixture table rather than one game's rules.
4. **PRs 7 and 8:** HTTP request limits, exact AWS resource configuration, and cost monitoring. The AWS provider choice itself is already accepted.

After each PR, update `HOT_TOPICS.md` and the relevant milestone acceptance status. Add an entry to `DECISIONS.md` only when a new architecture or product choice is accepted; update `CONTRACTS.md` and regenerate the schema whenever shared ownership or wire contracts change.
