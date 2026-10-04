# Architecture Decision Log

This file records durable project decisions so later work and sessions can recover the agreed direction without relying on chat history. Add new accepted decisions here with a date, decision, and rationale. Supersede an earlier entry explicitly instead of silently rewriting history.

## 2026-10-04 — Build a general multi-game web platform

**Decision:** The foundation is a game-agnostic platform with a catalogue, lobby, and reusable table experience. No particular game will shape the platform's core interfaces.

**Rationale:** The goal is to host multiple board and card games through common infrastructure. A specific game can be added as an independent definition using the platform's extension points.

## 2026-10-04 — Use Next.js, React, and TypeScript for the browser product

**Decision:** Use Next.js App Router for the web application, React for UI, and strict TypeScript for application and shared-package contracts.

**Rationale:** This gives the project browser routes and request handlers alongside reusable components, while typed contracts connect the web app, engine, game SDK, protocol, and game definitions.

## 2026-10-04 — Prefer typed composition and replaceable strategies

**Decision:** Model platform and game capabilities with typed interfaces, generics, composition, and discriminated unions. Use inheritance only where it provides real shared behavior. Let games register and replace rule strategies through the SDK.

**Rationale:** Games need different state, layouts, and rules, and future games must be addable without editing a central action enum or subclassing a monolithic base game. Strategies preserve extension room while the engine owns common orchestration.

## 2026-10-04 — Humans and bots share one decision protocol

**Decision:** Every decision kind pairs a typed, player-specific context with a typed response. Human controls and bots receive the same request and return the same response shape. Game strategies create contexts, validate responses, and apply game effects; the engine tracks IDs, pending responses, actors, and state versions.

**Rationale:** Game-specific decision logic stays small and separate from UI, bots, and networking. Bot policies can be registries of handlers over an agreed context contract, while the platform can treat all player responses consistently.

## 2026-10-04 — Share common visual behavior; let games compose their tables

**Decision:** Shared UI components own common display and interaction behavior such as card/token presentation, selection, animation, and zoom/pan. Game definitions provide content and compose those components into their own board/table layouts.

**Rationale:** Reusable components avoid reimplementing common interactions while game-specific composition leaves room for different graph shapes, board geometry, and presentation.

## 2026-10-04 — Enforce visibility through per-player projections

**Decision:** The game keeps one authoritative full state and produces a tailored player view and decision context for each recipient. Visibility scopes can include all players, selected players, a team, or host/internal-only data. Do not send hidden information and rely on UI hiding.

**Rationale:** Guest browsers are untrusted and can inspect every value they receive. Filtering at projection/serialization time makes the guest boundary explicit and supports a later server authority.

## 2026-10-04 — Use trusted host authority for the proof of concept

**Decision:** The host browser runs the game-independent engine and holds complete state. Guests send responses to the host and receive only their projected views. The host is trusted and may see hidden information.

**Rationale:** This supports an early playable browser version without requiring a dedicated game server. The trust limitation is explicit; server authority is required later if hosts must not see hidden information.

## 2026-10-04 — Use WebRTC for table traffic and thin coordination for discovery/signaling

**Decision:** Use WebRTC data channels for live peer traffic. A coordination service provides lobby discovery metadata and exchanges signaling data needed to establish peer connections; it does not own game rules or complete game state.

**Rationale:** The proof-of-concept host can communicate directly with guests while the game engine remains independent of the transport. Keeping coordination thin makes replacement of the host with a server straightforward.

## 2026-10-04 — Support turns and pending decisions before timers

**Decision:** The initial lifecycle models turns and pending decisions, including decisions that wait for responses from multiple players. Turn timers and timeout rules are deferred.

**Rationale:** The decision and flow abstractions should support sequential, simultaneous, and response-triggered interactions without complicating the first playable platform with timing policy.

## 2026-10-04 — Keep the engine portable for a future server authority

**Decision:** Engine, SDK, protocol, game rules, runtime validation, and visibility projections must not depend on Next.js or browser transport. Later, the same engine and game definitions should run on a dedicated server, with clients submitting the same decisions and receiving the same player-view contract.

**Rationale:** Moving authority should change the runtime/transport adapter and trust boundary, not require game-specific rule rewrites.

## 2026-10-04 — Establish package boundaries up front

**Decision:** Use `apps/web`, `packages/engine`, `packages/game-sdk`, `packages/protocol`, `packages/ui`, `packages/game-catalog`, `games`, and `services/coordination` as the initial architecture boundaries.

**Rationale:** These locations separate the browser product, reusable engine/contracts/UI, independent games, and network coordination. Dependency direction stays toward shared contracts rather than from shared packages into the app.
