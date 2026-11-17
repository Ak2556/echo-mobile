#!/usr/bin/env bash
#
# Compare row counts taken from the live database BEFORE a dump with the same tables in the copy
# restored from that dump.
#
# Usage: scripts/check-restored-counts.sh <live-counts-file> <restore-database-url>
#
# The counts file has one `schema.table=count` per line (see .github/workflows/db-backup.yml).
#
# Why this exists: the old check passed if the restored copy held at least one profile and one
# post. A dump made by a role that row level security hides rows from is still a dump that "worked":
# it restores cleanly, with a fraction of the data. Counting before the dump and requiring the
# restored copy to hold (almost) all of them is what turns "it ran" into "it is complete".
#
# Rows only normally arrive between the count and the dump, so the restored count should be at least
# the live one. A few can leave in those seconds (a notification read and purged, an account
# deleted), so up to 1 row or 1% fewer is allowed; a real shortfall is far larger than that.

set -euo pipefail

COUNTS="${1:-}"
URL="${2:-}"
if [ -z "$COUNTS" ] || [ -z "$URL" ] || [ ! -f "$COUNTS" ]; then
  echo "usage: $0 <live-counts-file> <restore-database-url>" >&2
  exit 2
fi

failed=0
checked=0
while IFS='=' read -r table live; do
  [ -z "$table" ] && continue
  checked=$((checked + 1))
  restored=$(psql "$URL" -tA -c "select count(*) from $table" 2>/dev/null || echo "missing")
  if ! [[ "$restored" =~ ^[0-9]+$ ]]; then
    echo "::error::$table did not restore at all (live had $live rows)"
    failed=1
    continue
  fi
  slack=$((live / 100))
  [ "$slack" -lt 1 ] && slack=1
  if [ "$restored" -lt $((live - slack)) ]; then
    echo "::error::$table restored $restored rows but the live database had $live: the dump is incomplete"
    failed=1
  fi
  printf '%-28s live=%-8s restored=%s\n' "$table" "$live" "$restored"
done < "$COUNTS"

if [ "$checked" -eq 0 ]; then
  echo "::error::the counts file is empty, so nothing was checked"
  exit 1
fi
exit "$failed"
