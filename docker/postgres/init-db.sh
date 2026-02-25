#!/bin/bash
# ══════════════════════════════════════════════════════════════
# PostgreSQL Docker Initialization Script
# ══════════════════════════════════════════════════════════════
# This script runs automatically when the PostgreSQL container
# is created for the first time (empty volume).
# It restores the mgmt_v2 database from the dump file.
# ══════════════════════════════════════════════════════════════

set -e

echo "=== ESPLUS ERP: Initializing PostgreSQL ==="

# Check if dump file exists
if [ -f /docker-entrypoint-initdb.d/mgmt_v2.dump ]; then
    echo "Restoring mgmt_v2 database from dump..."
    pg_restore \
        --username="$POSTGRES_USER" \
        --dbname="$POSTGRES_DB" \
        --no-owner \
        --no-privileges \
        --verbose \
        /docker-entrypoint-initdb.d/mgmt_v2.dump \
        2>&1 | tail -5
    echo "✅ mgmt_v2 restored successfully"
else
    echo "⚠️ No dump file found — Flyway will create schema on first backend start"
fi

echo "=== PostgreSQL initialization complete ==="
