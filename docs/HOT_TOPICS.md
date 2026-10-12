# Hot topics

This file tracks the work currently being shaped or reviewed. **Confirmed** items are agreed direction; **Undecided** items need a design choice; **Deferred** items are intentionally out of the current scope. Update status and next action as work advances.

The current baseline and proposed PR sequence are tracked in [ROADMAP.md](ROADMAP.md). Its PR sequence is a proposal; the durable choices below and in `DECISIONS.md` remain authoritative.

## Current development

| Topic | Status | Next action |
| --- | --- | --- |
| Initial repository layout and project guidance | Complete locally | Keep package ownership and documentation aligned as the browser app is added. |
| GitHub repository creation | Complete | Public repository at `reyesjorgeruben-beep/custom-board-games`; project structure and architecture are published on `main`. |
| Public repository secret protection | Complete | Full history passed Gitleaks, tracked files passed `detect-secrets`, the local pre-commit hook and CI are active, and GitHub secret scanning plus push protection are enabled. |
| Interface foundation | Implemented baseline; acceptance review pending | Check M1 and M4 criteria against the code, then build the M0 browser shell. |
| Contract review schema | Generated and checks green; ownership review pending | Align `CONTRACTS.md` with the decision-provider package and review schemas against implemented interfaces. |

## Confirmed direction

| Topic | Status | Agreement |
| --- | --- | --- |
| Web framework | Confirmed | Next.js, React, TypeScript; browser catalog, lobby, and table. |
| Game independence | Confirmed | Platform contracts must not be shaped around a particular game. |
| Extensibility | Confirmed | Use strongly typed interfaces and composition, with replaceable game strategies; do not hard-code a closed universe of actions. |
| Decision boundary | Confirmed | Humans and bots receive the same typed decision context and return the same response contract. |
| Initial authority and privacy | Confirmed | Host browser owns full state; guests receive only their visibility-filtered projection and decision context. |
| Initial connectivity direction | Confirmed | WebRTC data channels for host/guest play, with a separate coordination service for discovery/signaling. |
| Initial coordination provider | Confirmed | AWS Lambda Function URL and DynamoDB Standard with provisioned capacity; bounded HTTP polling during WebRTC setup. Avoid API Gateway WebSockets in the zero-cost first version. |
| Data and input boundaries | Confirmed | Retrieval through ports; presentation receives already loaded views; human and bot providers return the same decision response contract. |
| Turn support | Confirmed | Turns and decisions awaiting multiple player responses are in scope for the engine foundation. |

## Open design decisions

| Topic | Status | Next action |
| --- | --- | --- |
| Decision protocol representation | Initial typed/runtime contract implemented; evolution policy open | Review current ID, kind, actor, version, and Zod correlation against M1/M4; decide schema evolution before independently deployed clients. |
| Game and package registration | Open | Specify the game manifest/registry contract and how games are discovered without coupling the engine to a fixed catalog. |
| Visibility policy model | Audience helper and strict snapshot parsing implemented; enforcement review open | Verify each game's projection at the guest boundary; settle how audiences apply to nested views. |
| Multi-player decision resolution | Single-kind response barrier implemented; disconnect policy open | Review duplicate/stale submissions and resolution order; define behavior for disconnects and any need for concurrent kinds. |
| Lobby member identity | Provider-neutral capability authorization and retry recovery implemented in PR5 | Carry the private member capability through the HTTP adapter; keep the HMAC derivation secret stable across replicas. Design key rotation and issuance abuse controls before deployment. |
| Lobby signaling deployment | Provider-neutral atomic room service implemented; deployment policy open | PR5 uses a 24-hour create retry record and per-room join history bound of 256; PR8 must provide TTL cleanup and cost bounds. Before PR7 HTTP exposure, PR6 must assign signal sequences server-side so callers cannot poison polling cursors. Then add request limits, bounded polling, cleanup, and abuse controls. |
| Host loss and reconnection | Open | Choose what happens when the authoritative host disconnects and how a session can recover or end safely. |
| Inheritance versus composition conventions | Open | Document when shared base types are appropriate; use composition by default until concrete repeated behavior justifies inheritance. |

## Deferred

| Topic | Status | Revisit when |
| --- | --- | --- |
| Timers and deadlines | Deferred | Turn lifecycle and pending decisions work; add a configurable timer policy without coupling game rules to a clock. |
| Dedicated server authority | Deferred | The host-authoritative flow is clear and engine/game contracts can be exercised independently of browser hosting. |
| Full persistence and durable session recovery | Deferred | The first playable multiplayer path establishes which state and event data must survive reloads or host loss. |
