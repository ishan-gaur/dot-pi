---
name: redesign
description: Interactive workflow for redesigning library code. Research existing patterns, brainstorm approaches, sketch rewrites of application files, create branches for each option, compare changes, and merge the winner.
---

# Redesign Workflow

A structured workflow for exploring design alternatives for library code, centered around how changes affect application/consumer code.

## Overview

6 phases, alternating between agent work and user decisions:

1. **Research** — Understand the existing code
2. **Brainstorm** — Propose design approaches
3. **Sketch** — Write application-file rewrites for each approach
4. **Branch & Implement** — Create git branches and implement each option
5. **Compare** — User reviews changes across branches
6. **Merge** — User picks a winner

## Phase 1: Research

When the user identifies code to redesign:

1. Read all relevant source files in the target area
2. Identify the public API surface and internal structure
3. Find all consumers/application files that use the target code
4. Summarize your findings and ask the user to confirm:
   - Your understanding of the current design
   - Which application file(s) will serve as the "test case" for the redesign

Present clearly:
- Current API surface (classes, functions, protocols)
- Key abstractions and their responsibilities
- Consumer/application files that depend on this code
- Pain points or code smells you notice

## Phase 2: Brainstorm

Propose 3–5 distinct design approaches. For each:

1. **Name** — short, descriptive, lowercase-with-hyphens (becomes a branch name)
2. **Core idea** — 2–3 sentences
3. **Key API changes** — what's different from current
4. **Trade-offs** — what gets better, what gets worse
5. **Difficulty** — low / medium / high

Present as a numbered list. Ask the user:
- Which approaches to explore further
- Whether they have their own ideas to add

## Phase 3: Sketch

For each selected approach, write a **sketch** of how the target application file would look after the redesign.

Rules:
- Show the full application file as it would look post-redesign
- Use real function/class names from the proposed API
- Add comments marking where the API differs from current
- Do NOT implement the library side yet — this is a vision of the consumer experience
- Keep sketches concise — focus on the API surface, not boilerplate

Present all sketches. Ask: "Which of these do you want me to implement? I'll create a branch for each."

## Phase 4: Branch & Implement

First, note the current branch — this is the base for all redesign branches.

For each selected approach:

```bash
# Always start from the base branch
git checkout <base-branch>
git checkout -b redesign/<approach-name>

# ... implement library changes + rewrite application file ...

git add -A
git commit -m "redesign: <approach-name> — <one-line description>"
```

After implementing ALL branches, return to the base branch and call the `redesign_compare` tool:

```
Use the redesign_compare tool with base_branch set to the base branch name.
```

This opens an interactive viewer for the user.

## Phase 5: Compare

The user reviews changes using the interactive viewer (opened by `redesign_compare` tool or `/redesign-compare` command). They can:
- Browse the list of redesign branches with file-change stats
- View the full diff for any branch
- Cycle between branches

Wait for the user to tell you which approach they prefer, or if they want modifications.

## Phase 6: Merge

When the user picks a winner, tell them to run:

```
/redesign-merge
```

This command handles:
- Selecting the winning branch
- Merging it into the base branch
- Optionally deleting the other redesign branches

## Tips

- Keep scope focused — redesign one thing at a time
- The application file is the north star — if it doesn't look better, the redesign isn't worth it
- Don't gold-plate during branching — get the API right first, polish later
- Commit frequently so diffs are clean
- **Minimize the diff** — only change the core library file(s) being redesigned. Consumer/application files get sketched in comments or left as TODOs, not rewritten in full. The user will adapt those themselves.
- **Don't update every consumer** — touching stability_predictor, __init__.py exports, example files, etc. in the same branch bloats the diff and mixes design signal with mechanical updates. Focus the branch on the new abstraction.
