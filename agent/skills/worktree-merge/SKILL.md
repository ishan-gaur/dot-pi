---
name: worktree-merge
description: Safely merge git worktree branches and clean up. Uses the spawned pi session's conversation history to identify expensive artifacts before removing the worktree.
---

# Worktree Merge Workflow

Merge worktree branches into a target branch and safely remove the worktrees, preserving important gitignored artifacts.

## Why This Skill Exists

`git worktree remove` deletes the entire directory. `git status` only shows tracked/modified files — **gitignored artifacts are invisible** but will be permanently lost. ML projects commonly have large gitignored files (model checkpoints, datasets, embeddings, wandb logs) that took hours to produce.

## Workflow

### 1. Survey

List worktrees and identify unmerged branches:

```bash
git worktree list
git branch --no-merged <target-branch>
```

Present a table: branch name, worktree path (if any), merge status. Ask the user what to merge vs. delete.

### 2. Merge

Switch to the target branch and merge:

```bash
git checkout <target-branch>
git merge <branch-to-merge> --no-edit
```

### 3. Audit Artifacts via Spawned Session

**This is the critical step.** Before removing any worktree, ask the spawned pi session (which has full conversation context about what was done) to identify artifacts.

Run from the worktree directory to continue its most recent session:

```bash
cd <worktree-path>
pi -p -c --no-tools --no-extensions --no-skills --no-prompt-templates "<audit prompt>"
```

If the worktree is already removed but session files still exist, use `--session` directly:

```bash
pi -p --session <session-file> --no-tools --no-extensions --no-skills --no-prompt-templates "<audit prompt>"
```

Session files live at `~/.pi/agent/sessions/--<worktree-path-with-slashes-as-dashes>--/`.

#### Audit Prompt

```
I'm about to merge this worktree branch and remove the worktree directory. Before I do, I need to know what files to preserve.

Based on our conversation history, list every file that:
1. Was created, downloaded, trained, or generated during this session
2. Would be expensive or time-consuming to reproduce (training runs, large downloads, computed embeddings, etc.)
3. Might be too large to track in git

For each file, include:
- Path (relative to the worktree root)
- What it is / how it was created
- Whether it should be copied to the main repo, or is safe to discard (reproducible quickly)

Do NOT list files that are part of the git history (committed source code). Focus on gitignored artifacts, outputs, and data files.
```

Present the response to the user and ask what to preserve.

### 4. Copy & Remove

Copy selected artifacts into the target worktree at matching paths, then force-remove:

```bash
cp -r <artifact-paths> <target-worktree>/<matching-location>/
git worktree remove --force <worktree-path>
git branch -d <branch-name>
```

### 5. Clean Up Remaining Branches

Delete any other branches the user asked to remove:

```bash
git branch -D <branch-name>  # -D for unmerged branches being discarded
git branch -d <branch-name>  # -d for already-merged branches
```

## Gotchas

- **`git status` lies by omission** — gitignored files are invisible. The session-based audit catches what `find` would miss (and knows *why* files matter).
- **`git worktree remove` refuses if dirty** — use `--force`, but only after auditing and copying artifacts.
- **`git branch -d` vs `-D`** — `-d` refuses on unmerged branches (safety net). Use `-D` only for branches being intentionally discarded.
- **Worktree `.venv/`** — worktrees often have their own venv. These are safe to destroy (reproducible from lockfile).
- **Wandb logs** — `wandb/` dirs can be large but are synced to the cloud. Usually safe to discard.
- **Active processes** — the audit may surface running tmux sessions or SLURM jobs that should be stopped before cleanup.
- **Session file location** — pi stores sessions by working directory: `~/.pi/agent/sessions/--<path-with-dashes>--/`. These survive worktree removal.
