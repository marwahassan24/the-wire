#!/usr/bin/env bash
set -euo pipefail

# Restores a gzip-compressed SQL dump (as produced by backup.sh) into
# DATABASE_URL. Destructive: it runs the dump's CREATE/COPY statements
# against whatever database DATABASE_URL points at, and will fail loudly
# on conflicts with an existing schema rather than silently merge - point
# it at an empty database. Needs psql on PATH.
#
# Usage: DATABASE_URL=... scripts/restore.sh <dump.sql.gz>

: "${DATABASE_URL:?DATABASE_URL must be set}"
DUMP="${1:?Usage: DATABASE_URL=... scripts/restore.sh <dump.sql.gz>}"

if [ ! -f "$DUMP" ]; then
  echo "No such file: $DUMP" >&2
  exit 1
fi

# ON_ERROR_STOP so a broken restore fails the script (and the CI job)
# instead of psql printing an error per statement and exiting 0 anyway.
gunzip -c "$DUMP" | psql -v ON_ERROR_STOP=1 "$DATABASE_URL"
