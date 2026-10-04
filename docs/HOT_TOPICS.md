# Hot topics

This file tracks the work currently being shaped or reviewed. **Confirmed** items are agreed direction; **Undecided** items need a design choice; **Deferred** items are intentionally out of the current scope. Update status and next action as work advances.

## Current development

| Topic | Status | Next action |
| --- | --- | --- |
| Initial repository layout and project guidance | Complete locally | Review the written architecture before implementation planning. |
| GitHub repository creation | Complete | Private repository created at `reyesjorgeruben-beep/custom-board-games`; local architecture and project structure are published on `main`. |

## Confirmed direction

| Topic | Status | Agreement |
| --- | --- | --- |
| Web framework | Confirmed | Next.js, React, TypeScript; browser catalog, lobby, and table. |
| Game independence | Confirmed | Platform contracts must not be shaped around a particular game. |
| Extensibility | Confirmed | Use strongly typed interfaces and composition, with replaceable game strategies; do not hard-code a closed universe of actions. |
| Decision boundary | Confirmed | Humans and bots receive the same typed decision context and return the same response contract. |
| Initial authority and privacy | Confirmed | Host browser owns full state; guests receive only their visibility-filtered projection and decision context. |
| Initial connectivity direction | Confirmed | WebRTC data channels for host/guest play, with a separate coordination service for discovery/signaling. |
| Turn support | Confirmed | Turns and decisions awaiting multiple player responses are in scope for the engine foundation. |

## Open design decisions

| Topic | Status | Next action |
| --- | --- | --- |
| Decision protocol representation | Open | Define how runtime decision identifiers map to strongly typed per-game contexts and response schemas, including correlation, validation errors, and schema evolution. |
| Game and package registration | Open | Specify the game manifest/registry contract and how games are discovered without coupling the engine to a fixed catalog. |
| Visibility policy model | Open | Settle the audience model for public, team, individual player, and hidden values, and how projections are validated at every guest boundary. |
| Multi-player decision resolution | Open | Define pending-response lifecycle, duplicate/stale submissions, disconnect behavior, and resolution ordering without embedding game semantics in transport code. |
| Lobby signaling deployment | Open | Decide how guests find hosts and exchange WebRTC signaling data, including session identity and basic abuse controls. |
| Host loss and reconnection | Open | Choose what happens when the authoritative host disconnects and how a session can recover or end safely. |
| Inheritance versus composition conventions | Open | Document when shared base types are appropriate; use composition by default until concrete repeated behavior justifies inheritance. |

## Deferred

| Topic | Status | Revisit when |
| --- | --- | --- |
| Timers and deadlines | Deferred | Turn lifecycle and pending decisions work; add a configurable timer policy without coupling game rules to a clock. |
| Dedicated server authority | Deferred | The host-authoritative flow is clear and engine/game contracts can be exercised independently of browser hosting. |
| Full persistence and durable session recovery | Deferred | The first playable multiplayer path establishes which state and event data must survive reloads or host loss. |
