# Extensions

Global pi extensions live in `~/.pi/agent/extensions/*.ts` (auto-discovered). Use `/reload` to pick up changes.

## Installed Extensions

- **`update-agents-before-compact.ts`**: Hooks `session_before_compact` to prompt the agent to update AGENTS.md before context is lost. Shows a 10s confirm dialog; if accepted, cancels compaction, injects a follow-up message for the agent to update AGENTS.md, then triggers compaction after the agent finishes.
- **`message-in-a-bottle.ts`**: `/message-in-a-bottle` command — scans project for `TODO[pi]` lines, presents interactive multi-select (space = work on, r = remove), shows context preview around cursor, then sends selected items as a user message to the agent. Uses `rg` with `grep` fallback.
- **`redesign.ts`**: Provides `redesign_compare` tool, `/redesign-compare` command, `/redesign-merge` command. Uses `execSync` from `node:child_process` for git commands (not `pi.exec()`). Branch naming: `redesign/<name>` (prefix configurable). Diff viewer: two-level custom TUI — SelectList for branch picker, scrollable colored diff view with j/k/arrows scroll, m to merge, Esc to go back. See also [redesign skill](../skills/redesign/SKILL.md).
- **`spawn.ts`**: Spawns sub-agents for parallel task execution. `/spawn` launches pi in a git worktree on a `spawn/<name>` branch inside a tmux session. `/spawn-list` is the interactive manager: select a worktree → safety gate (blocks if pi active, offers kill) → merge or discard → optional artifact audit via `pi -p --session` → cleanup (tmux, sessions, worktree, branch). Replaces old `spawn-clean`.
- **`web-search.ts`**: Web search tool via Claude's built-in WebSearch.
- **`dot-pi-sync.ts`**: On `session_start`, fetches `origin/main` and prompts user to pull if `~/.pi` is behind. Skips silently if: in a spawn worktree (`spawn/` branch), not a git repo, or offline. 15s timeout on fetch. Reminds user to `/reload` after pulling.

## Extension Gotchas

- **`pi.exec()` is unreliable for shell commands** — args may be escaped/interpreted differently than expected. Use `execSync` from `node:child_process` with `{ cwd: ctx.cwd, encoding: "utf-8" }` instead.
- **`rg` may not be on the user's PATH** even if pi bundles it at `~/.pi/agent/bin/rg`. Always provide a `grep` fallback.
- **Unused imports in extensions** don't cause load failures but are noisy — keep imports clean.

## Redesign Extension — Future Plans

- **Explicit script tagging** — user should be able to tag specific scripts as "sketch this / implement this / test this" so the agent knows which files to rewrite in redesign branches vs. which are just context.
- **Branch grouping by parent** — redesign branches should be namespaced under the user's current branch: `<user-branch>/redesign/<name>` not just `redesign/<name>`. Allows multiple independent redesign sessions from different feature branches without collision.
- **Nesting & non-leaf branches** — unclear if we'd ever want to view non-leaf redesign branches; matters when nesting is implemented (redesign within a redesign). For now leaf-only is fine.
