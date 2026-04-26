#!/bin/bash
# Build and lint verification script
# Runs after code changes to ensure no errors

set -e

echo "🔍 Verifying build and lint..."

# Navigate to frontend directory
cd /Users/wagnertaiatella/repos/applyCopilot/frontend

# Run lint
echo "📋 Running ESLint..."
npm run lint

# Run build
echo "🏗️  Running build..."
npm run build

echo "✅ Build and lint verification passed!"
