# Interface foundation implementation plan

**Goal:** Establish a reviewable, game-independent contract foundation with executable examples, a relationship map, runtime validation, and unit tests.

**Architecture:** The protocol package owns serializable boundary types and schemas. Game SDK and engine consume those contracts without depending on UI or storage. Lobby data access and signaling use ports; presentation consumes already loaded view models, while human and bot adapters submit the same decision response shape.

**Tech stack:** TypeScript, Node 20 built-in test runner, `tsx`, `zod`, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-04-web-game-platform-design.md`.

## Work packages

1. **Protocol and workspace foundation:** add TypeScript workspace tooling, decision and transport contracts, runtime boundary schemas, and protocol tests. The contract map documents ownership and data flow.
2. **Game SDK and engine:** define game composition, strategy, projection, and turn interfaces. Implement minimal engine orchestration for pending decisions, identity/version checks, and validated transition with tests.
3. **Lobby coordination:** define a provider-neutral room/signaling repository and application service, with tests for creation, discovery, membership, and scoped message retrieval. Leave AWS infrastructure adapter for a later milestone.
4. **Presentation and input:** define render-ready table view models and separate human/bot decision providers from data loading. Add tests showing both providers use the same request/response contract.
5. **Integration and review:** run strict type checking and all unit tests, wire both into pre-commit, update decisions/hot topics/milestones, and review the relationship diagram against code.

## Review focus

- A guest must not receive a different player's pending decision context.
- A stale, duplicate, malformed, or wrong-actor response must leave authoritative state unchanged.
- A room query must not expose hidden game state or another room's signaling messages.
- UI input adapters must not load state or apply game rules.
- Game strategies must remain open to new decision kinds without a platform-wide action switch.
