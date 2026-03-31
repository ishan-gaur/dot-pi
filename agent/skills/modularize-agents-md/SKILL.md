---
name: modularize-agents-md
description: Break down a monolithic AGENTS.md into a web of interlinked, co-located design doc files. Use when a project's AGENTS.md has grown too large and mixes high-level project info with deep module-specific knowledge.
---

# Modularize AGENTS.md

Workflow for splitting a large AGENTS.md into a maintainable web of per-component design docs that live next to the code they describe.

## Principles

- **Abstraction boundaries** — parent files should not enumerate child details. If the codebase changes, only the co-located `.md` needs updating, not every file up to root.
- **Rich leaves, lean parents** — component docs are rich (design, intent, gotchas, checklists, cross-links). Parent/hub docs are lightweight (purpose, architecture overview, links).
- **Gotchas in both places** — a gotcha goes in the component where the fix lives AND in the consumer where the symptom surfaces.
- **Dependencies and Used By** — every component doc declares what it depends on and what consumes it, creating a navigable web.
- **Co-location** — design docs live next to the source files they describe (e.g. `probability_model.md` next to `probability_model.py`).
- **Skills for procedures** — recurring multi-step processes (e.g. "add a new model") become skills, not inline docs. Component docs link to the relevant skill and note when changes should trigger a skill update.

## Phase 1: Audit

Read the current AGENTS.md and understand the project structure.

1. List all top-level sections in the AGENTS.md
2. Map each section to the source code it describes
3. Categorize each section:
   - **Root AGENTS.md** — environment setup, code style, project structure (folder-level only), external dependencies, links to sub-docs
   - **Folder-level AGENTS.md** — lightweight hub for a directory: architecture overview, links to per-component docs
   - **Per-component `.md`** — design, API checklists, dependencies, used-by, gotchas for a specific module
   - **Skills** — procedural workflows that are reusable (e.g. adding a new model, running experiments)
   - **Global AGENTS.md** — truly cross-project knowledge (general language gotchas, environment info). Lives in the agent harness's global config.
4. Identify sections currently in the wrong place (e.g. project-specific gotchas in global AGENTS.md, module details in root)

Present your audit and proposed file tree to the user. Confirm before proceeding.

## Phase 2: Create Root and Hub Files

Rewrite the root AGENTS.md to be lean:

- **Keep**: environment setup (package manager, test/lint commands), code style, external dependencies, repo-level metadata
- **Replace** detailed file listings with one line per top-level folder + a link to that folder's AGENTS.md
- **Add** a Skills section listing available project skills and a note about skill discovery for different agent harnesses
- **Move** anything not project-specific (SLURM, general language gotchas) to the global AGENTS.md

For each major directory (`src/<package>/`, `tests/`, `examples/`, `docs/`, `models/`), create a lightweight `AGENTS.md`:

- Brief purpose statement
- Architecture overview (for code directories — inheritance trees, composition patterns)
- Links to per-component `.md` files
- Cross-cutting concerns (shared conventions, tokenization ecosystems)
- Known tech debt / stale code

Keep hubs under ~60 lines. They're navigation aids, not documentation.

## Phase 3: Create Per-Component Design Docs

For each logical component (one `.py` file or a tightly coupled group), create a `<component>.md` alongside the source. Work one at a time — show the user each extraction for feedback.

### Required sections

```markdown
# <Component Name> — Design Notes

<1-2 line purpose statement>

## Dependencies
- [other_component.md](relative/link) — what this component imports/relies on

## Used By
- [consumer.md](relative/link) — what imports/uses this component

## <Design content>
- API checklists (abstract vs concrete methods for ABCs)
- Key method signatures and contracts
- Pipeline walkthroughs for complex flows

## Maintenance
<Link to relevant skill if changes here should trigger a skill update>

## Gotchas
- Concrete, actionable traps with fixes
```

### Guidelines

- **Tables for API checklists** — abstract methods, overridable defaults, concrete methods
- **Code blocks for pipelines** — show the flow (e.g. `get_log_probs` pipeline)
- **Cross-link liberally** — every dependency and consumer should be a clickable relative link
- **Preserve existing knowledge** — don't lose gotchas or design notes from the original AGENTS.md. Every bullet should land somewhere.
- **No duplication of docstrings** — the `.md` captures working knowledge (how things connect, why decisions were made, what breaks). The docstring explains the API.
- **Models get their own directories** — each model in `models/<name>/` with its own `.md`, even if it's currently a single file. Scales better as models are added.
- **Don't over-split** — if two things are always edited together (e.g. `TransitionModel` and `LogitFormatter` in the same `.py`), they belong in the same `.md`

## Phase 4: Extract Skills and Clean Up

**Skills**: Look for procedural knowledge — multi-step processes an agent would follow. For each, create a skill in `.agents/skills/<name>/SKILL.md` with phases, decision trees, and gotcha checklists. Add maintenance notes in relevant component `.md` files pointing to skills that need updating when the component changes.

**Global AGENTS.md cleanup**: Move project-specific gotchas out. Keep truly cross-project knowledge. Generalize any gotchas that have broader applicability (remove project-specific references from the description).

**Verify**:
1. Every section from the original AGENTS.md landed somewhere — no knowledge lost
2. All relative links point to real files
3. Root and hub files are under ~60 lines each
4. Per-component docs have Dependencies, Used By, and Gotchas sections
5. Usage counters (`[×N]`) transferred from original to destination files
