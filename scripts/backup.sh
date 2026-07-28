#!/usr/bin/env bash
set -euo pipefail

# Dumps DATABASE_URL to a gzip-compressed plain-SQL file. Used by the
# nightly backup workflow (.github/workflows/backup.yml) and safe to run
# by hand for an ad hoc backup - needs pg_dump on PATH, matching the
# server's major version (Postgres 16 - see render.yaml).
#
# Usage: DATABASE_URL=... scripts/backup.sh [output-path]
# Defaults output-path to backup-<UTC timestamp>.sql.gz in the cwd.

: "${DATABASE_URL:?DATABASE_URL must be set}"
OUT="${1:-backup-$(date -u +%Y%m%dT%H%M%SZ).sql.gz}"

pg_dump --no-owner --no-privileges --dbname="$DATABASE_URL" | gzip -9 > "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
