# Skills

Reusable procedural workflows. Skills live in `~/.pi/agent/skills/<name>/SKILL.md`.

## Skill Design Preferences

- Don't over-phase — merge related steps rather than creating many tiny phases
- Scaffold first (directory structure, file stubs), then implement — not decide-then-scaffold
- Skills should clearly scope what they cover and what they don't (e.g. "generative models only, not predictive models")

## Available Skills

- **[modularize-agents-md](modularize-agents-md/SKILL.md)** — Break down a monolithic AGENTS.md into co-located design doc files. 4 phases: Audit → Root & Hubs → Per-Component Docs → Skills & Cleanup. Key principle: rich leaves (per-component .md with Dependencies/Used By/Design/Gotchas), lean parents (hub files with links). Co-locate design docs next to source files. Models each get their own subdirectory. Skills go in `.agents/skills/` for agent-harness-agnostic discovery (not `.pi/skills/`).
- **[redesign](redesign/SKILL.md)** — Interactive workflow for redesigning library code. Research existing patterns, brainstorm approaches, sketch rewrites, create branches for each option, compare changes, merge the winner. Paired with the [redesign extension](../extensions/AGENTS.md#redesign-extension--future-plans).
