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

## Pi Extensions

- Global extensions live in `~/.pi/agent/extensions/*.ts` (auto-discovered).
- **`update-agents-before-compact.ts`**: Hooks `session_before_compact` to prompt the agent to update AGENTS.md before context is lost. Shows a 10s confirm dialog; if accepted, cancels compaction, injects a follow-up message for the agent to update AGENTS.md, then triggers compaction after the agent finishes. Use `/reload` to pick up changes to extensions.
- **`message-in-a-bottle.ts`**: `/message-in-a-bottle` command — scans project for `TODO[pi]` lines, presents interactive multi-select (space = work on, r = remove), shows context preview around cursor, then sends selected items as a user message to the agent. Uses `rg` with `grep` fallback.

## Pi Extension Gotchas

- **`pi.exec()` is unreliable for shell commands** — args may be escaped/interpreted differently than expected. Use `execSync` from `node:child_process` with `{ cwd: ctx.cwd, encoding: "utf-8" }` instead.
- **`rg` may not be on the user's PATH** even if pi bundles it at `~/.pi/agent/bin/rg`. Always provide a `grep` fallback.
- **Unused imports in extensions** don't cause load failures but are noisy — keep imports clean.

## PyTorch Gotchas

- **Protocol + nn.Module MRO**: when a class inherits from both a `Protocol` and `nn.Module`, `nn.Module` must come first in the base list. Otherwise Protocol's `__call__` (which returns None) shadows `nn.Module.__call__` (which dispatches to `forward`). Similarly, `super().__init__()` may not reach `nn.Module.__init__()` through the Protocol — use `nn.Module.__init__(self)` explicitly.
- **0 × -inf = NaN**: one-hot matmul with a matrix containing `-inf` values produces NaN (IEEE float). Use direct tensor indexing (`matrix[indices]`) instead of `F.one_hot(indices) @ matrix`.
- **`F.one_hot()` returns LongTensor**: must call `.float()` before passing to `nn.Linear` or other float-expecting layers, otherwise `RuntimeError: mat1 and mat2 must have the same dtype`.
- **`nn.Embedding` padding_idx after manual weight assignment**: `nn.Embedding` zeros the padding row at init, but does NOT re-enforce the constraint after `.weight.data.copy_()` or similar. Always `.zero_()` the padding row explicitly after manual weight assignment.
- **ESM `ESMC.from_pretrained` device arg**: must pass `torch.device("cpu")`, NOT the string `"cpu"` — ESM's code calls `device.type` which fails on a plain string with `AttributeError: 'str' object has no attribute 'type'`.

## Python ABC / Mixin Gotchas

- **`@abstractmethod` on non-ABC mixins doesn't propagate**: `ABCMeta.__new__` collects abstract methods from `base.__abstractmethods__`, which is only set on classes created by `ABCMeta`. A plain mixin with `@abstractmethod` won't have its abstract methods enforced on child classes. Fix: make the mixin inherit from `ABC`.
- **HuggingFace mixin pattern**: no `__init__` in mixins, use class-level attribute defaults. Avoids all cooperative `__init__` / MRO issues with nn.Module. See HF's `GenerationMixin`, `ModuleUtilsMixin`, `PushToHubMixin` — all are pure method bags with zero `__init__`.
- **ABC mixin + nn.Module MRO**: `SomeMixin(ABC)` composes cleanly with `SomeModel(nn.Module, ABC)` — `ABCMeta` is a subclass of `type`, so metaclass resolution works. Just don't list `ABC` explicitly in a class that already inherits from a `ConditionableMixin(ABC)` — that causes MRO conflict (redundant ABC).

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
