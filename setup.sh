#!/usr/bin/env bash
# Bootstrap pi + ~/.pi config from git@github.com:ishan-gaur/dot-pi.git
#
# Usage (new machine):
#   curl -sL https://raw.githubusercontent.com/ishan-gaur/dot-pi/main/setup.sh | bash
#
# Or if you prefer not to pipe to bash:
#   curl -sLO https://raw.githubusercontent.com/ishan-gaur/dot-pi/main/setup.sh
#   bash setup.sh

set -euo pipefail

REPO="git@github.com:ishan-gaur/dot-pi.git"
TARGET="$HOME/.pi"

# --- 1. Install tmux if needed ---
if ! command -v tmux &>/dev/null; then
    echo "tmux not found — installing..."
    if [[ "$(uname)" == "Darwin" ]]; then
        if command -v brew &>/dev/null; then
            brew install tmux
        else
            echo "ERROR: Homebrew not found. Install it first: https://brew.sh"
            exit 1
        fi
    elif command -v apt-get &>/dev/null; then
        sudo apt-get update && sudo apt-get install -y tmux
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y tmux
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm tmux
    else
        echo "ERROR: Could not detect package manager. Install tmux manually."
        exit 1
    fi
    echo "tmux $(tmux -V) installed."
else
    echo "tmux $(tmux -V) found."
fi

# --- 2. Install Node via nvm if needed ---
if ! command -v node &>/dev/null; then
    echo "Node.js not found — installing nvm + Node..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install --lts
    echo "Node $(node --version) installed."
else
    echo "Node $(node --version) found."
fi

# --- 3. Install pi if needed ---
if ! command -v pi &>/dev/null; then
    echo "Installing pi..."
    npm install -g @mariozechner/pi-coding-agent
    echo "pi installed: $(pi --version 2>/dev/null || echo 'done')"
else
    echo "pi already installed."
fi

# --- 4. Install Claude Code if needed (for web search extension) ---
if ! command -v claude &>/dev/null; then
    echo "Installing Claude Code CLI..."
    npm install -g @anthropic-ai/claude-code
    echo "Claude Code installed: $(claude --version 2>/dev/null || echo 'done')"
else
    echo "Claude Code already installed."
fi

# Log in to Claude Code if not already authenticated
if claude auth status 2>/dev/null | grep -q '"loggedIn": false'; then
    echo ""
    echo "Claude Code is not logged in (needed for web search)."
    echo "Running 'claude login'..."
    claude login
fi

# --- 5. Clone/sync ~/.pi config ---
if [ -d "$TARGET/.git" ]; then
    echo "~/.pi is already a git repo — pulling latest..."
    git -C "$TARGET" pull --ff-only
elif [ -d "$TARGET" ]; then
    # pi has already created ~/.pi with local state — clone into temp and merge
    echo "~/.pi exists but isn't a git repo — merging with remote..."
    TMPDIR=$(mktemp -d)
    git clone "$REPO" "$TMPDIR"

    # Move .git into the existing directory
    mv "$TMPDIR/.git" "$TARGET/.git"
    rm -rf "$TMPDIR"

    # Reset index to match what's on remote, but don't touch working tree
    # This lets gitignored local files (auth.json, sessions/, etc.) survive
    cd "$TARGET"
    git checkout -- .gitignore
    git reset HEAD -- .
    git checkout -- .
    echo "~/.pi is now tracking origin/main."
else
    echo "Cloning config into ~/.pi..."
    git clone "$REPO" "$TARGET"
fi

echo ""
echo "Setup complete. Run 'pi' to start."
