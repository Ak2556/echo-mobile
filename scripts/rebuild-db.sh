#!/usr/bin/env bash
# Rebuild an EMPTY Supabase database from supabase/recovery/ alone.
#
#   scripts/rebuild-db.sh postgresql://postgres:postgres@127.0.0.1:54322/postgres
#
# Order matters: schema, then auth/storage objects, then queues+cron, then content. Prints what is
# still missing at the end (vault secrets, edge function secrets), because those hold values that
# are deliberately not in the repo. Read supabase/recovery/README.md first.
#
# Refuses a database that already has public tables unless REBUILD_FORCE=1: this is for a new
# project, not for repairing a live one.
set -euo pipefail

DB="${1:-}"
[ -n "$DB" ] || { echo "usage: $0 <postgres-url of the NEW, empty database>" >&2; exit 2; }
DIR="$(cd "$(dirname "$0")/../supabase/recovery" && pwd)"
PSQL=(psql "$DB" -v ON_ERROR_STOP=0 -q)

existing=$(psql "$DB" -Atc "select count(*) from pg_tables where schemaname='public'")
if [ "$existing" != "0" ] && [ "${REBUILD_FORCE:-}" != "1" ]; then
  echo "refusing: the database already has $existing public tables (REBUILD_FORCE=1 to override)." >&2
  exit 1
fi

apply() {
  echo "== $1"
  "${PSQL[@]}" -f "$2" 2>&1 | grep -E "ERROR|WARNING" | sed 's/^psql:[^ ]* /  /' || true
}

apply schema.sql "$DIR/schema.sql"

# The snapshot is stamped with the last migration it contains; anything newer is replayed on top.
THROUGH=$(sed -n 's/^-- through migration: *//p' "$DIR/schema.sql" | head -1 | tr -d '[:space:]')
[ -n "$THROUGH" ] || { echo "schema.sql has no '-- through migration:' stamp" >&2; exit 1; }
tail_count=0
for m in $(find -L "$DIR/../migrations" -name '*.sql' | sort); do
  v=$(basename "$m" | cut -d_ -f1)
  if [ "$v" -gt "$THROUGH" ]; then apply "migration $v (newer than the snapshot)" "$m"; tail_count=$((tail_count + 1)); fi
done
echo "   snapshot through $THROUGH, replayed $tail_count newer migration(s)"

apply auth-storage.sql "$DIR/auth-storage.sql"
apply bootstrap.sql "$DIR/bootstrap.sql"
apply seed-content.sql "$DIR/seed-content.sql"

echo
echo "== result"
psql "$DB" -Atc "select 'public tables:   '||count(*) from pg_tables where schemaname='public'"
psql "$DB" -Atc "select 'rls disabled:    '||count(*) from pg_tables where schemaname='public' and not rowsecurity"
psql "$DB" -Atc "select 'policies:        '||count(*) from pg_policies where schemaname='public'"
psql "$DB" -Atc "select 'queues:          '||count(*) from pgmq.list_queues()"
psql "$DB" -Atc "select 'cron jobs:       '||count(*)||' ('||count(*) filter (where active)||' active)' from cron.job"
psql "$DB" -Atc "select 'daily questions: '||count(*) from public.daily_questions"
psql "$DB" -Atc "select 'vault secrets:   '||count(*)||' of 8' from vault.secrets"
echo
echo "Still to do by hand: vault secrets (names in bootstrap.sql), edge function secrets, deploy the"
echo "edge functions, point the app and the R2 worker at the new project. See the README."
