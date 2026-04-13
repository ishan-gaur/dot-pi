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
GH_VERSION="2.89.0"

install_gh_linux_user_local() {
    local release_arch had_home_bin_in_path tarball url tmpdir

    case "$(uname -m)" in
        x86_64|amd64) release_arch="amd64" ;;
        aarch64|arm64) release_arch="arm64" ;;
        *)
            echo "ERROR: Unsupported Linux architecture for gh: $(uname -m)"
            return 1
            ;;
    esac

    had_home_bin_in_path=0
    if [[ ":$PATH:" == *":$HOME/bin:"* ]]; then
        had_home_bin_in_path=1
    fi

    tarball="gh_${GH_VERSION}_linux_${release_arch}.tar.gz"
    url="https://github.com/cli/cli/releases/download/v${GH_VERSION}/${tarball}"
    tmpdir=$(mktemp -d)

    curl -fsSL "$url" -o "$tmpdir/$tarball"
    tar -xzf "$tmpdir/$tarball" -C "$tmpdir"

    mkdir -p "$HOME/bin"
    cp "$tmpdir/gh_${GH_VERSION}_linux_${release_arch}/bin/gh" "$HOME/bin/gh"
    chmod +x "$HOME/bin/gh"
    export PATH="$HOME/bin:$PATH"

    rm -rf "$tmpdir"

    if [[ $had_home_bin_in_path -eq 0 ]]; then
        echo "NOTE: Add '$HOME/bin' to PATH in your shell rc to use gh in new shells."
    fi
}

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

# --- 3. Install GitHub CLI if needed ---
if ! command -v gh &>/dev/null; then
    echo "GitHub CLI not found — installing..."
    if [[ "$(uname)" == "Darwin" ]]; then
        if command -v brew &>/dev/null; then
            brew install gh
        else
            echo "ERROR: Homebrew not found. Install it first: https://brew.sh"
            exit 1
        fi
    elif [[ "$(uname)" == "Linux" ]]; then
        install_gh_linux_user_local
    else
        echo "ERROR: Unsupported OS for gh install: $(uname)"
        exit 1
    fi
    echo "gh installed: $(gh --version | awk 'NR==1{print $0}')"
else
    echo "gh found: $(gh --version | awk 'NR==1{print $0}')"
fi

# Log in to GitHub CLI if not already authenticated
if ! gh auth status &>/dev/null; then
    echo ""
    echo "GitHub CLI is not logged in."
    echo "Running 'gh auth login --web'..."
    gh auth login --web
fi

# --- 4. Install pi if needed ---
if ! command -v pi &>/dev/null; then
    echo "Installing pi..."
    npm install -g @mariozechner/pi-coding-agent
    echo "pi installed: $(pi --version 2>/dev/null || echo 'done')"
else
    echo "pi already installed."
fi

# --- 5. Install Gemini CLI if needed (for web search extension) ---
if ! command -v gemini &>/dev/null; then
    echo "Installing Gemini CLI..."
    npm install -g @google/gemini-cli
    echo "Gemini CLI installed: $(gemini --version 2>/dev/null || echo 'done')"
else
    echo "Gemini CLI already installed: $(gemini --version 2>/dev/null | head -n 1 || echo 'found')"
fi

# Log in to Gemini CLI if not already authenticated
if ! gemini -p "Reply with exactly: ok" >/dev/null 2>&1; then
    echo ""
    echo "Gemini CLI is not authenticated yet (needed for web search)."
    echo "Launching 'gemini' now — choose 'Sign in with Google' and complete login."
    echo "After login, exit Gemini to continue setup."
    gemini
fi

echo ""
echo "Gemini web-search quick use:"
echo "  gemini -p \"Search the web for: <query>\""
echo "  Docs: https://geminicli.com/docs/cli/tutorials/web-tools/"

# --- 6. Install helix if needed ---
if ! command -v hx &>/dev/null; then
    echo "Helix editor not found — installing..."
    if [[ "$(uname)" == "Darwin" ]]; then
        if command -v brew &>/dev/null; then
            brew install helix
        else
            echo "ERROR: Homebrew not found. Install it first: https://brew.sh"
            exit 1
        fi
    elif command -v apt-get &>/dev/null; then
        sudo apt-get update && sudo apt-get install -y helix
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y helix
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm helix
    else
        echo "WARNING: Could not detect package manager. Install helix manually: https://docs.helix-editor.com/install.html"
    fi
    echo "helix installed: $(hx --version 2>/dev/null || echo 'done')"
else
    echo "helix found: $(hx --version 2>/dev/null || echo 'found')"
fi

# --- 7. Install uv if needed ---
if ! command -v uv &>/dev/null; then
    echo "uv not found — installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # uv installs to ~/.local/bin — add to PATH for this session
    export PATH="$HOME/.local/bin:$PATH"
    echo "uv installed: $(uv --version 2>/dev/null || echo 'done')"
else
    echo "uv found: $(uv --version 2>/dev/null || echo 'found')"
fi

# --- 8. Ghostty terminfo (for SSH to remote machines) ---
if ! infocmp -x xterm-ghostty &>/dev/null; then
    echo "xterm-ghostty terminfo not found — installing..."
    # Ghostty bundles its terminfo; download and compile it
    tmpdir=$(mktemp -d)
    curl -fsSL https://ghostty.org/docs/terminfo -o "$tmpdir/ghostty.terminfo" 2>/dev/null || true
    if [ -f "$tmpdir/ghostty.terminfo" ] && [ -s "$tmpdir/ghostty.terminfo" ]; then
        tic -x "$tmpdir/ghostty.terminfo"
        echo "xterm-ghostty terminfo installed."
    else
        # Fallback: generate from current Ghostty installation if available
        if command -v ghostty &>/dev/null; then
            ghostty +show-terminfo | tic -x -
            echo "xterm-ghostty terminfo installed (from local Ghostty)."
        else
            echo "WARNING: Could not install xterm-ghostty terminfo."
            echo "  If you use Ghostty, see: https://ghostty.org/docs/help/terminfo"
        fi
    fi
    rm -rf "$tmpdir"
else
    echo "xterm-ghostty terminfo found."
fi

# --- 9. Clone/sync ~/.pi config ---
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
