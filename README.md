# Custom Board Games

A browser-based platform for hosting and playing different board games through a shared lobby, table interface, and typed game engine. The platform is designed so game rules can be added without rewriting player interaction, networking, or common visual components.

The project is in its architecture and repository setup stage. No game implementation has been selected as a template for the engine.

## Project documents

- [Architecture design](docs/superpowers/specs/2026-10-04-web-game-platform-design.md)
- [Decision log](docs/DECISIONS.md)
- [Milestones](docs/MILESTONES.md)
- [Project insights](docs/PROJECT_INSIGHTS.md)
- [Hot topics](docs/HOT_TOPICS.md)
- [Coordination storage options](docs/STORAGE_OPTIONS.md)
- [Contributor and agent guidelines](AGENTS.md)

## Planned structure

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

These folders reserve responsibility boundaries; implementation has not started.

## Secret protection

Keep credentials in your local environment or a managed secret store. `.env` files and common private-key formats are ignored, but an ignore rule does not replace a secret scan.

The repository uses `detect-secrets` before each commit and in GitHub Actions. Install the local hook once after cloning:

```powershell
python -m pip install pre-commit==4.6.2
pre-commit install
pre-commit run --all-files
```

The hook scans staged files and runs without network verification. GitHub secret scanning and push protection add checks for supported credentials on public repositories. If a real secret reaches Git history, revoke it; deleting a file in a later commit does not remove it from earlier commits.
