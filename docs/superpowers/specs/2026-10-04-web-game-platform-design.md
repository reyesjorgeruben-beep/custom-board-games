# Web Game Platform Architecture

**Status:** Accepted architecture baseline  
**Date:** 2026-10-04

## Purpose

Build a browser-playable platform for multiple board and card games. The platform owns the common experience and lifecycle; each game contributes its own state, rules, presentation composition, and content through typed extension points. The architecture must not assume a particular game or bake a fixed catalogue of game actions into the platform.

The intended product shape is a browsable game catalogue, a lobby for finding or joining a table, and a reusable table experience. Board Game Arena is a high-level product reference for that shape, not an implementation template.

## Accepted technical direction

- **Web framework:** Next.js App Router, React, and TypeScript with strict type checking. Next.js provides browser routes and thin request handlers; React builds the catalogue, lobby, table, and game surfaces.
- **Extension model:** Typed contracts and composition are the default. Use inheritance only where a genuine shared base behavior benefits from it. Game behavior is added through registered definitions and strategies, not platform conditionals or a growing universal action enum.
- **Authority for the proof of concept:** The host player's browser runs the authoritative game engine and holds the complete game state. Guest browsers receive player-specific views and send decision responses to the host.
- **Peer connection:** WebRTC data channels carry live table traffic. A small coordination service supports discovery/lobby metadata and WebRTC signaling (SDP/ICE exchange); it does not run game rules or store complete game state.
- **Timing:** Turns and pending decisions are in scope. Turn clocks and timeout policy are deferred.

## Repository boundaries

The repository's initial architecture directories are:

```text
apps/web/                 Next.js application, routes, browser integration
packages/engine/          Game-independent state and decision lifecycle
packages/game-sdk/        Typed contracts and authoring helpers for games
packages/protocol/        Serializable messages, player views, validation
packages/ui/              Shared visual board-game components
packages/game-catalog/    Game metadata and registration/discovery
games/                    Independent game definitions, layouts, and assets
services/coordination/    Lobby discovery and WebRTC signaling
docs/                     Architecture, decisions, milestones, and project context
```

Dependency direction should remain one-way: game definitions depend on the SDK and protocol; the engine consumes SDK contracts; the web app composes the engine, catalog, protocol, and UI; shared packages do not import from `apps/web`. The coordination service knows room and connection metadata, not game-specific state types or rules.

## Main concepts and contracts

### Game definition

Each registered game provides a descriptor with stable identity/version and player-count metadata, initial-state creation, a typed state model, decision strategies, a turn/flow policy, a player-view projection, and a table layout/content composition. Asset and localization references can be associated with the descriptor. Registration is the only integration point needed for the catalogue and runtime to discover a game.

The SDK should let game authors express these pieces as composed interfaces with game-specific generic parameters. It should keep a path for an exceptional game to replace or extend a strategy without changing engine code. Do not make game authors subclass a large platform class just to define a small rule.

### Decisions, responses, and player context

The engine exposes a discriminated, serializable decision protocol. Each game defines a decision map keyed by decision kind. For each kind, the map pairs a context type with the response type. A decision request identifies the game/table, decision ID, kind, eligible actor, current state version, and the context for that actor. A response echoes the decision ID and kind, identifies the submitting actor, and carries a value of the matching response type.

Conceptually:

```ts
type DecisionMap = {
  [kind: string]: { context: unknown; response: unknown };
};

type DecisionRequest<M extends DecisionMap, K extends keyof M> = {
  id: string;
  kind: K;
  actorId: string;
  stateVersion: number;
  context: M[K]["context"];
};

type DecisionResponse<M extends DecisionMap, K extends keyof M> = {
  decisionId: string;
  kind: K;
  actorId: string;
  response: M[K]["response"];
};
```

The concrete SDK should preserve the correlation between a decision kind, its context, and its response through generic/discriminated types. TypeScript types alone do not validate network input: every received response and serialized message must also pass runtime schema validation before it reaches game logic.

The human UI and a bot consume the same player-specific decision request and return the same response contract. A human adapter renders controls and submits the selected response. A bot adapter is a registry of handlers keyed by decision kind; each handler receives only the agreed context and returns the matching response. Neither adapter computes game rules or needs to know how a connection is implemented.

Game-defined decision strategies own context creation, legal-response validation, and the rule effect of a valid response. The game flow/turn policy decides who can be asked and when pending requests are resolved. The engine owns common mechanics: assign IDs and versions, track pending responses, reject invalid/duplicate/stale or wrong-actor submissions, invoke the selected strategy, update the authoritative state, and publish new player views. A response may resolve immediately, wait for other required actors, or cause a follow-up decision. The protocol must support these forms without requiring one fixed action list.

Contexts are explicit, small, and sufficient for that decision. They are generated for the intended actor after visibility filtering; clients and bots should not receive full internal state merely because it is convenient. The engine passes the same contract regardless of whether the response comes from a human or a bot.

### Turns and pending decisions

The engine models whose turn or phase is active and supports pending decisions. A turn policy may expose a single actor, multiple eligible actors, or a response barrier that waits for a configured group. Once the required responses arrive, the associated game strategy resolves them and the flow policy advances play. This provides the lifecycle needed for sequential turns, simultaneous input, and response-to-another-player situations.

The first implementation does not require timers. The contract can gain optional deadline/clock policies later without putting timekeeping inside individual game rules. Disconnect and reconnect behavior should preserve pending decisions where possible; room expiration/recovery policy belongs to coordination/runtime infrastructure.

### State visibility and player views

Game state is authoritative and may contain both public and private information. A visibility scope can express information visible to all players, selected players, a team, or only the host/internal engine. Games implement a projection from full state to a viewer-specific `PlayerView`; the projection includes only renderable information and that viewer's pending decision contexts. Visibility is enforced by what is serialized and sent, not by hiding already-delivered data in the UI.

The host browser is trusted for this proof of concept and may inspect the complete state, including information hidden from guests. Guests are untrusted inputs and must never be sent fields, assets, random seeds, or decision contexts that their role is not allowed to know. The host validates every guest response against its current state, pending decision, actor identity, permitted response schema, and state version. WebRTC encrypts the connection, but encryption does not replace per-player projection or validation.

This is a trusted-host model: it protects guests from accidental information disclosure by the application, but it cannot prevent the host owner from inspecting or altering the game. A dedicated authoritative server is required if the host itself must not see or control hidden information.

### Shared visual components and game layouts

`packages/ui` owns reusable visual and interaction behavior: generic card and token rendering, common selection and action affordances, board surfaces, zoom/pan, and shared animation behavior. Shared components accept typed game-specific presentation data or render slots; they must not hard-code one game's rules or assume all games use the same board geometry.

Each game composes these pieces into its own table layout and supplies its labels, art, card faces/backs, graph or board structure, and game-specific adornments. A game may provide custom components for genuinely unique visuals while reusing common controls and primitives. Shared interaction callbacks emit typed decision responses through the player protocol; they do not mutate authoritative state directly.

## Runtime flow

1. The catalogue presents registered game metadata. A player creates or joins a lobby and selects a game/table configuration.
2. The host loads the registered game definition, creates full initial state, and starts the game-independent engine.
3. The engine asks the game's flow policy for the next decision(s), and strategies construct only the context each eligible actor may see.
4. The host's UI renders its own view. Guest views and their pending decision requests are projected and sent over their data channels.
5. A human UI or bot handler returns a typed response. The host treats the network payload as untrusted, validates it, checks actor/decision/version, and passes it to the selected game strategy.
6. The engine applies the result, waits for any other required responses or advances the flow, then sends refreshed per-player projections.

Coordination carries lobby presence and the signaling exchange needed to establish peer connections. Game-specific rules and complete state stay in the host runtime. The table route provides common participant, connection, and table chrome around the game-composed surface.

## Security and migration boundary

Keep the game engine, SDK, protocol, runtime schemas, projections, and decision strategies independent from Next.js and browser transport APIs. The host runtime is an adapter around these packages, not part of the game rules. The coordination service must not receive hidden state as a shortcut for discovery or signaling.

When moving authority to a dedicated server, run the same engine, game definitions, validation, state transitions, visibility projection, and random source on that server. Change the host connection adapter so every browser becomes a client that receives a projection and submits a response. Keep the decision and player-view protocol stable. This moves the trust boundary without requiring each game's rules or UI to be rewritten. Server-side persistence, authentication, anti-cheat, and secret random generation can then be added as runtime concerns.

## Non-goals for the initial architecture baseline

- Choosing or implementing a particular board/card game.
- Defining exhaustive game rules or a universal action enumeration.
- Timers, tournament/ranking systems, persistence guarantees, or matchmaking algorithms.
- Preventing a trusted host from inspecting its own in-memory state.
- A mandatory custom visual implementation for every game.

## Open implementation choices

Choose specific runtime-schema, state-serialization, styling, animation, and signaling libraries during implementation, provided they preserve the boundaries above. The exact hosting/provider setup and persistence model also remain open. These choices should not change the game-independent decision contract or per-player projection boundary.
