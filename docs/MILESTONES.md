# Project milestones

Milestones describe platform outcomes. They do not depend on implementing a particular board game.

## M0 — Project foundation and web shell

**Outcome:** The repository has a documented, runnable web application foundation and clearly owned package boundaries.

**Acceptance criteria:**

- The web application uses Next.js, React, and TypeScript.
- The browser experience has distinct catalog, lobby, and table destinations, even if early views are placeholders.
- The repository separates the web app, game-independent engine, game SDK, shared protocol, shared UI, game catalog, game packages, and coordination service.
- Repository guidance explains the architecture, contribution expectations, decision log, and current work.

## M1 — Typed game engine and extension contracts

**Outcome:** A game can be registered and advanced through stable, typed contracts without coupling its rules to the web or transport layers.

**Acceptance criteria:**

- A game definition describes its metadata, setup, state, rule strategies, legal decisions, validation, transitions, and visibility projection.
- Extension points use typed interfaces and composition; adding a game does not require editing a platform-wide exhaustive action switch.
- The engine owns common lifecycle and turn progression while game-specific strategies own their rules.
- The shared contracts can represent decisions with different typed contexts and responses, including decisions that await multiple players.

## M2 — Shared tabletop presentation

**Outcome:** Games can present varied boards and pieces through a reusable browser tabletop system.

**Acceptance criteria:**

- Shared visual components cover common elements such as cards, tokens, boards, selection, and available actions.
- Common interaction behavior, including zoom and animation hooks, is implemented once and reused.
- Game layouts can arrange and style shared elements and provide game-specific content without duplicating their common behavior.
- A game can render its current player-facing state and pending decision through the shared presentation contracts.

## M3 — Lobby and host-authoritative multiplayer

**Outcome:** Players can discover or join a game table in the browser and play through a host-authoritative session.

**Acceptance criteria:**

- A player can select an available game, create or join a lobby, and enter its table.
- The host runs the authoritative game engine and holds full state.
- Guests communicate with the host through the chosen real-time transport; WebRTC data channels are the initial direction.
- Discovery and connection signaling are separated from game rules and do not need access to hidden game state.
- Each guest receives only their permitted state and decision context, and submits responses through the shared decision protocol.
- Turn ownership and pending responses are represented and advanced by the engine.

## M4 — Human and bot decision parity

**Outcome:** Human players and bots participate through the same decision and response contract.

**Acceptance criteria:**

- Every decision provides an explicit actor, typed context, response contract, and identifier or equivalent correlation key.
- Human controls submit responses conforming to that contract; the engine validates them before applying game rules.
- A bot can be registered as a decision provider that maps a decision context to a valid response.
- Bot code has no dependency on UI, sockets, or host implementation details.
- The contract supports both immediate decisions and decisions that wait for other players before resolution.

## M5 — Portable authority and production readiness

**Outcome:** The platform can strengthen session reliability and move authority from a host browser to a dedicated server while retaining game implementations.

**Acceptance criteria:**

- Engine and game contracts run behind either a host-browser authority adapter or a dedicated-server authority adapter.
- Guests cannot retrieve full authoritative state through application APIs or transport messages.
- Session recovery and host-disconnect behavior are specified and implemented for the selected hosting model.
- Timer behavior is added as a configurable platform policy without embedding wall-clock assumptions in game rules.
- The deployment and operational requirements for coordination and authoritative sessions are documented.
