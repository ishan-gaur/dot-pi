# dot-pi

My [pi](https://github.com/badlogic/pi) agent configuration — extensions, skills, gotchas, and preferences.

## Setup

On a new machine:

```bash
curl -sL https://raw.githubusercontent.com/ishan-gaur/dot-pi/main/setup.sh | bash
```

This installs tmux, Node (via nvm), GitHub CLI, pi, Gemini CLI, and clones this config into `~/.pi`. Safe to re-run — it pulls latest if already set up.

If you're on a new machine, you probably also want to install helix, uv, Github CLI, and add the $TERMINFO for Ghostty to work properly.
TODO[pi] add instructions for these four steps here.

## What's included

- **[Extensions](agent/extensions/AGENTS.md)** — `message-in-a-bottle`, `update-agents-before-compact`, `redesign`, `spawn`, `web-search`
- **[Skills](agent/skills/AGENTS.md)** — `modularize-agents-md`, `redesign`
- **[Gotchas](agent/gotchas/)** — [PyTorch](agent/gotchas/pytorch.md), [Python ABC/Mixin](agent/gotchas/python-abc-mixin.md), [SLURM](agent/gotchas/slurm.md)
- **[Global guidelines](agent/AGENTS.md)** — session hygiene, code style, Python project conventions

## Machine-specific files (gitignored)

| File | Contents |
|---|---|
| `agent/auth.json` | API keys |
| `agent/models.json` | Local model server config |
| `agent/sessions/` | Session logs |
| `agent/bin/` | Platform-specific binaries |
