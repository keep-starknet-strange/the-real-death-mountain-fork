#!/usr/bin/env bash
# Option B: Fork + branch setup for sharing with colleagues
# Run this AFTER forking https://github.com/z-korp/death-mountain to your GitHub account.

set -e

# --- 1. Set your GitHub username (replace with yours) ---
GITHUB_USER="${GITHUB_USER:-YOUR_USERNAME}"

if [[ "$GITHUB_USER" == "YOUR_USERNAME" ]]; then
  echo "Please set your GitHub username:"
  echo "  export GITHUB_USER=your-github-username"
  echo "  ./scripts/setup-fork-and-push.sh"
  echo "Or edit this script and replace YOUR_USERNAME."
  exit 1
fi

REPO_URL="https://github.com/${GITHUB_USER}/death-mountain.git"
CORAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PARENT_DIR="$(dirname "$CORAL_DIR")"
CLONE_DIR="${PARENT_DIR}/death-mountain-fork"
BRANCH="coral-mods"

echo "Fork repo:    $REPO_URL"
echo "Branch:      $BRANCH"
echo "Source:      $CORAL_DIR"
echo "Clone into:  $CLONE_DIR"
echo ""

# --- 2. Clone your fork (creates death-mountain-fork next to death-mountainCORAL) ---
if [[ ! -d "$CLONE_DIR" ]]; then
  echo "Cloning your fork..."
  git clone "$REPO_URL" "$CLONE_DIR"
else
  echo "Directory $CLONE_DIR already exists; skipping clone."
fi

cd "$CLONE_DIR"

# --- 3. Create branch for your modifications ---
if ! git show-ref --quiet "refs/heads/$BRANCH"; then
  git checkout -b "$BRANCH"
  echo "Created branch: $BRANCH"
else
  git checkout "$BRANCH"
  echo "Using existing branch: $BRANCH"
fi

# --- 4. Copy your modified project over (keeps clone's .git) ---
echo "Copying your modifications from death-mountainCORAL..."
rsync -av --exclude='.git' "$CORAL_DIR/" ./

# --- 5. Commit and push ---
git add -A
if git diff --staged --quiet; then
  echo "No changes to commit (already in sync?)."
else
  git status
  git commit -m "Apply coral / local modifications"
  echo "Pushing to origin $BRANCH..."
  git push -u origin "$BRANCH"
fi

echo ""
echo "Done. Share with colleagues:"
echo "  Repo:   $REPO_URL"
echo "  Branch: $BRANCH"
echo "  Clone:  git clone -b $BRANCH $REPO_URL"
