# Project insights and agreed structure

This document is the orientation map for the project. Durable decisions belong in `DECISIONS.md`; active work and unresolved questions belong in `HOT_TOPICS.md`; outcomes belong in `MILESTONES.md`.

## Product shape

The project is a game-agnostic browser platform for discovering, joining, and playing different board and card games. Board Game Arena is a reference for the broad catalog, lobby, and table experience, not a requirement to copy its internal design.

The core player journey is:

```text
catalog → lobby → table
                   ├── shared tabletop UI
                   ├── player-specific game view
                   └── pending decision → player response
```

No single game should dictate the platform's core abstractions. Games register their own rules, state, presentation layout, and decision contexts against shared contracts.

## Agreed technical direction

- **Web application:** Next.js, React, and TypeScript.
- **Architecture:** strongly typed interfaces and composition define extension points. Prefer composing capabilities; allow inheritance where a stable shared base genuinely helps.
- **Game logic:** the engine owns common session lifecycle and turn progression. A game definition supplies its setup, state transitions, validation, visibility policy, decision descriptions, and pluggable rule strategies.
- **Actions:** avoid a closed, platform-wide list of every possible game action. Decisions declare their own typed context and response contract so new games can introduce rules without changing the engine's central action taxonomy.
- **Visuals:** shared card, token, board, selection, animation, zoom, and action components own reusable display and interaction behavior. Game-specific layouts compose those components and provide content and arrangement.
- **Player decisions:** a decision is presented through the same typed protocol to humans and bots. Each decision supplies the context needed for that decision; a response is validated by the game rules before it changes state.
- **Turn coordination:** the engine tracks whose turn it is and can collect responses from multiple players before resolving a decision. Timers are deferred and should later be a configurable platform policy.
- **Initial authority model:** the host browser runs the authoritative engine and holds full game state. Guests receive player-specific projections and send responses. WebRTC data channels are the initial real-time transport direction; a coordination service handles discovery/signaling, not game rules or hidden state.
- **Future authority model:** keep game and engine contracts portable so authority can move to a dedicated server. Guests must never be able to request or infer data that the visibility policy excludes from their projection.

## Intended repository map

The initial package boundaries are:

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js browser application: catalog, lobby, and table routes |
| `packages/engine` | Game-independent session lifecycle, turns, decision collection, and rule orchestration |
| `packages/game-sdk` | Typed contracts and helpers used to define/register games |
| `packages/protocol` | Shared decision, response, state projection, and transport message contracts |
| `packages/ui` | Reusable tabletop visual and interaction components |
| `packages/game-catalog` | Game discovery metadata and registration |
| `games/` | Independent game definitions and assets |
| `services/coordination` | Lobby discovery and WebRTC connection signaling |

These are responsibility boundaries, not a commitment to a specific bundler or deployment topology. Keep dependency direction from games and UI toward shared contracts; game rules must not depend on Next.js or WebRTC.

## Cross-cutting design constraints

### Visibility and trust

Visibility must be expressible for at least public-to-all players, team-scoped, player-private, and hidden information. The host may inspect full authoritative state in the proof of concept. Every guest-facing state and decision context must be produced through a player-specific projection. The projection boundary should remain usable unchanged when authority moves to a server.

### Extensibility

Use small, typed contracts with explicit ownership. Game-specific behavior should be injected as strategies or composed capabilities. Shared infrastructure should schedule and validate decisions without knowing each game's domain semantics.

### Human and bot parity

The decision context is the input contract; the response is the output contract. Human controls and bot providers are adapters around this same boundary. A bot registry can choose a provider by decision type or game strategy, while keeping decision computation independent of UI and networking.

## Current phase of understanding

The high-level architecture is agreed. Package APIs, serialization details, signaling deployment, and recovery behavior still need concrete designs as implementation reaches them. See `HOT_TOPICS.md` for the current queue and status.
