#!/bin/bash
set -e

# Construct DB_DSN for Go binaries from individual env vars
if [ -n "$DB_HOST" ] && [ -n "$DB_USER" ] && [ -n "$DB_PASSWORD" ] && [ -n "$DB_NAME" ]; then
  export DB_DSN="${DB_USER}:${DB_PASSWORD}@tcp(${DB_HOST}:${DB_PORT:-3306})/${DB_NAME}?charset=utf8mb4&parseTime=True&loc=Local"
fi

# Ensure writable directories exist for runtime artifacts
mkdir -p /app/scraper /app/resume

# Apply DB schema on first deploy (skip if config table already exists)
if [ -n "$DB_HOST" ]; then
  if ! mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1 FROM config LIMIT 1" 2>/dev/null; then
    echo "Initializing database schema..."
    mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /app/db/schema.sql
    echo "Schema initialized."
  fi
  # Apply auth migration (skip if users table already exists)
  if ! mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1 FROM users LIMIT 1" 2>/dev/null; then
    echo "Running auth migration..."
    mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /app/db/auth.sql
    echo "Auth migration complete."
  fi
  # Add read_at column to jobs (idempotent via IF NOT EXISTS)
  mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /app/db/jobs_read.sql 2>/dev/null || true
  # Seed authorized users (idempotent — INSERT IGNORE skips existing)
  mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /app/db/seed_users.sql 2>/dev/null || true
  # Apply jev migration (skip if jev_conversations table already exists)
  if ! mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1 FROM jev_conversations LIMIT 1" 2>/dev/null; then
    echo "Running jev migration..."
    mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /app/db/jev.sql
    echo "Jev migration complete."
  fi
fi

cd /app/jev.app
exec node server.js
