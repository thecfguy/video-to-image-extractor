#!/usr/bin/env bash
set -euo pipefail

# Usage: ./deploy.sh [patch|minor|major]
# Defaults to patch if no argument given.

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

echo "▶ Bumping version ($BUMP)…"
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)
echo "  → $NEW_VERSION"

echo "▶ Building…"
npm run build

echo "▶ Deploying to Vercel…"
vercel --yes

echo ""
echo "✓ Deployed $NEW_VERSION"
