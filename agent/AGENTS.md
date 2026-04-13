# Global Agent Guidelines

## Session Hygiene

- When you learn something non-obvious about the project (data quirks, file locations, normalization logic, gotchas, key design decisions), update the project's AGENTS.md immediately — don't wait until session end. [×2]
- Keep AGENTS.md notes factual and concise: what a future session needs to hit the ground running.
- Don't duplicate what's already in the README; AGENTS.md is for working knowledge (how things actually connect), README is for users.

## AGENTS.md Usage Tracking

- Whenever you consult an AGENTS.md file (global or project-level) and use a specific piece of information to inform your work, increment a usage counter on that line. [×2]
- Format: append `[×N]` at the end of the line (or bullet point), where N is the cumulative count. First use: `[×1]`. On subsequent uses, increment: `[×2]`, `[×3]`, etc.
- "Use" means the information actually influenced a decision, avoided a mistake, or saved you from re-discovering something — not just reading the file.
- If a line has no counter, it has never been used yet. This is fine — not every note will be useful.
- When updating AGENTS.md with new notes, do NOT add a counter (new notes start at zero).
- This data helps the user understand which kinds of working knowledge are most valuable across sessions.

## Code Style

- Be concise — avoid verbose docstrings that restate what the code already says. Keep comments to non-obvious "why" explanations.
- **Tensor shape annotations on every intermediate variable** — annotate shape and semantics inline, e.g. `# h_V [B, L, H] - node features after encoding`. This makes complex tensor code self-documenting without needing to trace through function signatures. Define an index legend at the top of each class/module (e.g. `S: batch, P: position, T: token dim, D: embedding dim`) and use it consistently. Learned from Foundry's ProteinMPNN implementation where every single tensor line has a shape+meaning comment.
- When redesigning: change the core abstraction only. Don't propagate to every consumer in the same pass — sketch consumer changes in comments or leave as TODOs for the user to adapt.
- Preserve the user's existing comments, TODOs, and docstrings. Add new notes alongside them — don't replace or delete what the user wrote.
- Don't add tiny wrapper methods (e.g. `tokenize()` that just calls `self.tokenizer(...)`) — let callers use the underlying API directly.
- Prefer composition over multiple inheritance when both parents have `__init__` — double `nn.Module.__init__` resets internal state. Use "has-a" (e.g. `self.probe = LinearProbe(...)`) not "is-a" for combining template nn.Modules with PredictiveModel.

## Python Projects

- Use `uv` for all package management and running Python code — never raw `pip` or `python`.
  - Install dependencies: `uv add <package>`
  - Dev dependencies: `uv add --dev <package>`
  - Run scripts: `uv run python <script>`
  - Run tests: `uv run pytest tests/ -v`
  - Sync environment: `uv sync`
  - Install package in editable mode: `uv pip install -e .`
- If `ruff` is not in `pyproject.toml`, add it: `uv add --dev ruff` (run from repo root).
- Use `uv run ruff check` and `uv run ruff format` to lint and format.
- `uv init` creates `.python-version` pinned to system default (may be 3.14) — run `uv python pin 3.12` before `uv sync` if project needs a specific version.
- `uv init` also creates a `main.py` stub — delete it for library projects.

## Refactoring

- **Jedi for project-wide Python renames**: if `jedi` is installed, use `jedi.Script(path=..., project=jedi.Project('.')).rename(line, col, new_name=...).apply()` for symbol-aware renames across all files. Handles imports, type hints, inheritance, references — but NOT docstrings, comments, `__all__` string entries, or non-Python files. Follow up with sed for those. Always rename longer names first (e.g. `FooBar` before `Foo`) to avoid partial sed matches.

## Workflow

- Always show the diff and ask for user review before pushing to remote. Don't push without approval. [×2]
- **Before any merge/rebase** (from a worktree branch, or merging a worktree into main): check `git status` for uncommitted changes in the target repo. If there are any, ask the user whether to commit or stash them before proceeding — git will refuse the merge otherwise, and the error is confusing.
- **Subagent usage**: use subagents to get a "user's" dissenting opinion on design choices (e.g. comparing format options). Don't farm out straightforward questions you can answer yourself — the user expects *you* to answer those.

## GitHub CLI

- `gh` installed at `~/bin/gh` (v2.89.0, user-level, no sudo) [×1]
- Authenticated as `ishan-gaur` via device flow (`gh auth login --web`) [×1]
- Useful for creating repos: `gh repo create ishan-gaur/<name> --public --source=. --push`
- Visibility changes need: `gh repo edit <repo> --visibility public --accept-visibility-change-consequences`

## dot-pi Repo

- The git repo root is `~/.pi`, but most config lives under `agent/`. Use `agent/` prefix in git commands (e.g. `git add agent/extensions/foo.ts`, not `git add extensions/foo.ts`). [×2]
- `setup.sh` at repo root bootstraps new machines: installs tmux, nvm + Node, gh, pi, Gemini CLI, helix, uv, Ghostty terminfo, then clones/merges config. [×3]
- **Tracked**: extensions, skills, gotchas, AGENTS.md files, `agent/settings.json` (user preferences: default model, packages)
- **Gitignored**: `agent/auth.json` (API keys), `agent/models.json` (local model servers), `agent/sessions/`, `agent/bin/` [×1]
- ZAI is a built-in API-key provider in current pi (`docs/providers.md`); configure `agent/auth.json` key `"zai"` and do **not** add `agent/models.json` entries unless overriding defaults.

## Sub-docs

- [Extensions](extensions/AGENTS.md) — pi extensions, gotchas, and future plans
- Skills — reusable procedural workflows and design preferences (see below)
- [PyTorch Gotchas](gotchas/pytorch.md) — nn.Module MRO, LoRA, embedding traps
- [Python ABC / Mixin Gotchas](gotchas/python-abc-mixin.md) — abstractmethod propagation, HF mixin pattern
- [SLURM](gotchas/slurm.md) — cluster info, submit script, buffering, uv on clusters
- [Ray](gotchas/ray.md) — `/tmp` disk space on shared nodes

## Skills

Reusable procedural workflows. Skills live in `~/.pi/agent/skills/<name>/SKILL.md`.

### Skill Design Preferences

- Don't over-phase — merge related steps rather than creating many tiny phases
- Scaffold first (directory structure, file stubs), then implement — not decide-then-scaffold
- Skills should clearly scope what they cover and what they don't (e.g. "generative models only, not predictive models")

### Available Skills

- **[modularize-agents-md](skills/modularize-agents-md/SKILL.md)** — Break down a monolithic AGENTS.md into co-located design doc files. 4 phases: Audit → Root & Hubs → Per-Component Docs → Skills & Cleanup. Key principle: rich leaves (per-component .md with Dependencies/Used By/Design/Gotchas), lean parents (hub files with links). Co-locate design docs next to source files. Models each get their own subdirectory. Skills go in `.agents/skills/` for agent-harness-agnostic discovery (not `.pi/skills/`).
- **[redesign](skills/redesign/SKILL.md)** — Interactive workflow for redesigning library code. Research existing patterns, brainstorm approaches, sketch rewrites, create branches for each option, compare changes, merge the winner. Paired with the [redesign extension](extensions/AGENTS.md#redesign-extension--future-plans).
- **[worktree-merge](skills/worktree-merge/SKILL.md)** — Safely merge worktree branches and clean up. Key gotcha: `git status` hides gitignored artifacts (checkpoints, data files, wandb logs) that get destroyed on `git worktree remove`. Scans for artifacts before removal.
- **[add-provider](skills/add-provider/SKILL.md)** — Add a new AI model provider to pi. Research API compatibility, add models.json config (if not built-in), create auth.json placeholder, instruct user to fill in key.
