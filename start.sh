#!/bin/sh
# Stålstadens Lineup — Production startup script
# 1. Creates the database if it doesn't exist
# 2. Runs Drizzle migrations (creates all tables)
# 3. Starts the Node.js server

set -e

echo "🏒 Stålstadens Lineup — Starting..."

# Parse DATABASE_URL to extract components for database creation
# Format: mysql://user:pass@host:port/dbname
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is not set. Cannot start."
  exit 1
fi

# Extract database name and base URL (without database name)
DB_NAME=$(echo "$DATABASE_URL" | sed 's|.*/||' | sed 's|\?.*||')
DB_BASE=$(echo "$DATABASE_URL" | sed "s|/$DB_NAME.*||")

if [ -n "$DB_NAME" ] && [ -n "$DB_BASE" ]; then
  echo "📦 Ensuring database '$DB_NAME' exists..."
  # Connect without specifying a database and create it if missing
  node -e "
    const mysql = require('mysql2/promise');
    (async () => {
      let conn;
      try {
        conn = await mysql.createConnection(process.env.DATABASE_URL.replace('/$DB_NAME', ''));
        await conn.execute('CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`');
        console.log('✅ Database \"$DB_NAME\" is ready.');
      } catch (err) {
        // If we can't create it, it might already exist or we don't have CREATE perms
        // Try connecting to it directly to verify
        try {
          if (conn) await conn.end();
          conn = await mysql.createConnection(process.env.DATABASE_URL);
          console.log('✅ Database \"$DB_NAME\" already exists.');
        } catch (err2) {
          console.error('⚠️  Could not verify database:', err2.message);
          console.error('   Continuing anyway — migrations will fail if DB is missing.');
        }
      } finally {
        if (conn) await conn.end();
      }
    })();
  "
else
  echo "⚠️  Could not parse database name from DATABASE_URL. Skipping auto-create."
fi

# Run Drizzle migrations (idempotent — safe to run every deploy)
echo "📦 Running database migrations..."
npx drizzle-kit migrate 2>&1 || echo "⚠️  Migration warning (may be OK if tables already exist)"

echo "🚀 Starting server..."
exec node dist/index.js
