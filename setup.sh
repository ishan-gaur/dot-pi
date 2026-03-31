#!/usr/bin/env bash
# Bootstrap ~/.pi from git@github.com:ishan-gaur/dot-pi.git
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

if [ -d "$TARGET/.git" ]; then
    echo "~/.pi is already a git repo — pulling latest..."
    git -C "$TARGET" pull --ff-only
    exit 0
fi

if [ -d "$TARGET" ]; then
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
    echo "Done — ~/.pi is now tracking origin/main."
    echo "Run 'cd ~/.pi && git status' to see any local differences."
else
    echo "Cloning into ~/.pi..."
    git clone "$REPO" "$TARGET"
    echo "Done."
fi
