#!/usr/bin/env bash
set -euo pipefail

# Purge tmp trash older than 24h
# Usage: artifact-trash-purge.sh <project-root> [hours=24]

PROOT="${1:-/Users/aaron/Developer/MGMTV2/.claude/projects/mgmt}"
HOURS="${2:-24}"
TRASH="$PROOT/data/tmp/_trash"

[ -d "$TRASH" ] || { echo "ℹ️ no trash dir"; exit 0; }

echo "🧹 purge trash older than ${HOURS}h: $TRASH"
find "$TRASH" -mindepth 1 -maxdepth 1 -type d -mtime +0 -print | while read -r d; do
  # hour-level precision via python
  python3 - "$d" "$HOURS" <<'PY'
import os,sys,time,shutil
p=sys.argv[1]
h=float(sys.argv[2])
age=(time.time()-os.path.getmtime(p))/3600
if age>=h:
    print(f"purge {p} (age={age:.1f}h)")
    shutil.rmtree(p,ignore_errors=True)
PY
done

echo "✅ purge done"
