# Project guidelines for contributors and agents

These guidelines have high importance for all work in this repository. Read the architecture design, decision log, milestones, and hot topics before changing a subsystem.

## Collaboration

- Parallelize independent work with subagents when this improves progress. Use **`gpt-6-luna` with `xhigh` reasoning effort** for project subagents, unless the user explicitly requests another model or effort.
- Give every agent explicit ownership of files or modules. Tell each agent that others share the workspace, to preserve concurrent edits and coordinate shared interfaces.
- Keep dependent design, integration, and review steps sequential. The coordinating agent is responsible for reconciling agent outputs and maintaining the agreed architecture.
- Record important accepted architecture and product choices in `docs/DECISIONS.md`. Keep `docs/HOT_TOPICS.md` current for choices under review or active development. Update milestones and insights when their substance changes.

## Architecture contracts

- Keep game rules independent of Next.js, React, browser APIs, transports, and human or bot implementations.
- Use explicit TypeScript interfaces and discriminated unions for public contracts. Validate network and persisted data at runtime; compile-time types alone do not make untrusted input safe.
- Favor composition for optional game capabilities and visual elements. Use replaceable strategies at genuine variation points. Do not make a closed universal action list that restricts future games.
- Keep the same decision context and response contract for humans and bots. Game definitions decide legal responses and state changes; the platform delivers decisions and coordinates turns.
- Maintain authoritative state only in the host runtime for the initial architecture. Send each guest only its player-specific projection and decision context. Never send hidden state and rely on the guest UI to conceal it.
- Keep transport behind an interface so the authoritative runtime can later move from the host browser to a dedicated server without changing game rules.
- Separate shared UI behavior from game-specific layout and content. Reuse cards, tokens, boards, selection, zoom, and animation controls through composition.

## Scope and quality

- Keep the engine game agnostic. Do not design core APIs around one example game.
- Implement in milestone order unless a documented decision changes the sequence. Turns are in initial scope; timers are deferred.
- Prefer small modules with one responsibility and stable public interfaces. Document changes to shared contracts alongside the change.
- Do not claim a feature is complete without checking the concrete acceptance criteria in `docs/MILESTONES.md`.
