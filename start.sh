#!/bin/sh
# Stålstadens Lineup — Production startup script
# Runs database migrations (if any pending) then starts the Node.js server.

set -e

echo "🏒 Stålstadens Lineup — Starting..."

# Run Drizzle migrations (idempotent — safe to run every deploy)
echo "📦 Running database migrations..."
npx drizzle-kit migrate 2>&1 || echo "⚠️  Migration warning (may be OK if tables already exist)"

echo "🚀 Starting server..."
exec node dist/index.js
