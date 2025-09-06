#!/bin/bash

# Script to bump version and prepare for release
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -e

BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Error: Invalid bump type. Use patch, minor, or major"
    exit 1
fi

echo "Bumping $BUMP_TYPE version..."

# Bump version in package.json
cd package
npm version $BUMP_TYPE --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
cd ..

echo "Version bumped to: $NEW_VERSION"

# Build the package
echo "Building package..."
pnpm build

# Run tests
echo "Running tests..."
pnpm test

echo "✅ Version $NEW_VERSION is ready for release!"
echo "📦 Package built and tested successfully"
echo "🚀 Push to main branch to trigger automatic publishing"
