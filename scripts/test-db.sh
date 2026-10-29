#!/usr/bin/env bash
# Applies all migrations to a scratch PostgreSQL database (with a Supabase stub)
# and runs the RLS isolation tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=lifepilot_test_$$
psql -q -c "create database $DB" >/dev/null
trap 'psql -q -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/supabase_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rls_isolation.sql
