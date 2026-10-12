# Custom Board Games

A browser-based platform for hosting and playing different board games through a shared lobby, table interface, and typed game engine. The platform is designed so game rules can be added without rewriting player interaction, networking, or common visual components.

The project has a game-independent contract foundation and a Next.js shell with catalog, lobby, and table destinations. These browser views show empty states while game registration, live rooms, and table play are built. No game implementation has been selected as a template for the engine.

## Project documents

- [Architecture design](docs/superpowers/specs/2026-10-04-web-game-platform-design.md)
- [Contract map and protocol schema](docs/CONTRACTS.md)
- [Decision log](docs/DECISIONS.md)
- [Milestones](docs/MILESTONES.md)
- [Project insights](docs/PROJECT_INSIGHTS.md)
- [Hot topics](docs/HOT_TOPICS.md)
- [Coordination storage options](docs/STORAGE_OPTIONS.md)
- [Contributor and agent guidelines](AGENTS.md)

## Repository structure

| Path | Responsibility |
| --- | --- |
| `apps/web/` | Next.js web app: catalog, lobby, and table routes |
| `packages/engine/` | Game session lifecycle, state transitions, turns, and pending decisions |
| `packages/game-sdk/` | Typed contracts and helpers used by game definitions |
| `packages/protocol/` | Versioned messages and decision contracts shared across boundaries |
| `packages/ui/` | Reusable visual elements and player interaction components |
| `packages/game-catalog/` | Game registration and metadata for discovery |
| `games/` | Independent game definitions added through the SDK |
| `services/coordination/` | Room discovery and connection signaling; no authoritative game state |
| `docs/` | Architecture, decisions, milestones, insights, and active topics |

The protocol, game, lobby, and presentation boundaries are implemented incrementally. See the contract map for their relationships and current interfaces.

## Working with contracts

Install Node.js 20.9.0 or newer, then run:

```powershell
npm ci
npm run check
```

`npm run check` performs strict TypeScript checking, runs all unit tests, and confirms the committed JSON Schema matches the runtime schemas. Every unit test file starts with a short comment stating what it covers. The same command runs in pre-commit and CI.

Run the browser shell locally with `npm run web:dev`, then open `http://localhost:3000`. Use `npm run web:build` to verify the production routes. The catalog, lobby, and table currently show empty states; they do not yet create rooms or start games.

## Secret protection

Keep credentials in your local environment or a managed secret store. `.env` files and common private-key formats are ignored, but an ignore rule does not replace a secret scan.

The repository uses `detect-secrets` before each commit and in GitHub Actions. Install the local hook once after cloning:

```powershell
python -m pip install pre-commit==4.6.2
pre-commit install
pre-commit run --all-files
```

The hook scans staged files and runs the project checks. GitHub secret scanning and push protection add checks for supported credentials on public repositories. If a real secret reaches Git history, revoke it; deleting a file in a later commit does not remove it from earlier commits.
