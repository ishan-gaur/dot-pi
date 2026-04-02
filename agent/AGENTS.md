# Global Agent Guidelines

## Session Hygiene

- When you learn something non-obvious about the project (data quirks, file locations, normalization logic, gotchas, key design decisions), update the project's AGENTS.md immediately — don't wait until session end.
- Keep AGENTS.md notes factual and concise: what a future session needs to hit the ground running.
- Don't duplicate what's already in the README; AGENTS.md is for working knowledge (how things actually connect), README is for users.

## AGENTS.md Usage Tracking

- Whenever you consult an AGENTS.md file (global or project-level) and use a specific piece of information to inform your work, increment a usage counter on that line.
- Format: append `[×N]` at the end of the line (or bullet point), where N is the cumulative count. First use: `[×1]`. On subsequent uses, increment: `[×2]`, `[×3]`, etc.
- "Use" means the information actually influenced a decision, avoided a mistake, or saved you from re-discovering something — not just reading the file.
- If a line has no counter, it has never been used yet. This is fine — not every note will be useful.
- When updating AGENTS.md with new notes, do NOT add a counter (new notes start at zero).
- This data helps the user understand which kinds of working knowledge are most valuable across sessions.

## Code Style

- Be concise — avoid verbose docstrings that restate what the code already says. Keep comments to non-obvious "why" explanations.
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

## Workflow

- Always show the diff and ask for user review before pushing to remote. Don't push without approval.

## dot-pi Repo

- The git repo root is `~/.pi`, but most config lives under `agent/`. Use `agent/` prefix in git commands (e.g. `git add agent/extensions/foo.ts`, not `git add extensions/foo.ts`).
- `setup.sh` at repo root bootstraps new machines: installs nvm + Node + pi, then clones/merges config.
- **Tracked**: extensions, skills, gotchas, AGENTS.md files, `agent/settings.json` (user preferences: default model, packages)
- **Gitignored**: `agent/auth.json` (API keys), `agent/models.json` (local model servers), `agent/sessions/`, `agent/bin/`

## Sub-docs

- [Extensions](extensions/AGENTS.md) — pi extensions, gotchas, and future plans
- Skills — reusable procedural workflows and design preferences (see below)
- [PyTorch Gotchas](gotchas/pytorch.md) — nn.Module MRO, LoRA, embedding traps
- [Python ABC / Mixin Gotchas](gotchas/python-abc-mixin.md) — abstractmethod propagation, HF mixin pattern
- [SLURM](gotchas/slurm.md) — cluster info, submit script, buffering

## Ray on Clusters Gotchas

- **Ray `/tmp` disk space**: Ray defaults to `/tmp/ray/` for session data, object spilling, and logs. On shared cluster nodes, `/tmp` fills up quickly for large jobs (e.g., 1000-environment parallel evals). Fix: `export RAY_TMPDIR=/path/to/shared/storage/tmp/ray` before launching. Symptom: `OSError: [Errno 28] No space left on device` partway through the job, no output saved.

## uv + SLURM/Cluster Gotchas

- **`UV_PYTHON_INSTALL_DIR` must point to shared storage on clusters**: By default uv installs Python to `~/.local/share/uv/python/`. If `$HOME` is local disk (not NFS), venv shebangs break on compute nodes with "bad interpreter: No such file or directory". Fix: set `UV_PYTHON_INSTALL_DIR` to a shared filesystem path before creating venvs.
- **After changing `UV_PYTHON_INSTALL_DIR`**: Must run `uv python install <version>` to download Python to the new location, then recreate the venv (`uv venv --python <version> <path>`).
- **Diagnosing "bad interpreter" in venvs**: Check the symlink chain: `ls -la <venv>/bin/python*` → follow to the real interpreter → verify it exists on the compute node. Also check `<venv>/pyvenv.cfg` for the `home =` path.

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
