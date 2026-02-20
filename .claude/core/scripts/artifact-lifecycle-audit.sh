#!/usr/bin/env bash
set -euo pipefail

# Check artifact lifecycle hygiene for one project.
# Usage:
#   artifact-lifecycle-audit.sh <project-root>
#   artifact-lifecycle-audit.sh <project-root> --tmp-only
#   artifact-lifecycle-audit.sh <project-root> --cleanup-task <task-id>
#   artifact-lifecycle-audit.sh <project-root> --enforce-no-audits
#   artifact-lifecycle-audit.sh <project-root> --cleanup-audits

PROOT="${1:-/Users/aaron/Developer/MGMTV2/.claude/projects/mgmt}"
MODE="${2:-all}"
TASK_ID="${3:-}"

TMP_DIR="$PROOT/data/tmp"

if [ "$MODE" = "--cleanup-task" ]; then
  [ -n "$TASK_ID" ] || { echo "Usage: $0 <project-root> --cleanup-task <task-id>"; exit 2; }
  SRC="$PROOT/data/tmp/$TASK_ID"
  [ -d "$SRC" ] || { echo "ℹ️ no tmp dir for task: $TASK_ID"; exit 0; }
  TS="$(date +%Y%m%d-%H%M%S)"
  TRASH="$PROOT/data/tmp/_trash/$TS-$TASK_ID"
  mkdir -p "$(dirname "$TRASH")"
  mv "$SRC" "$TRASH"
  echo "🗑 moved to trash: $TRASH"
  echo "ℹ️ hard-delete after 24h by policy"
  exit 0
fi

if [ "$MODE" = "--cleanup-audits" ]; then
  AD="$PROOT/data/audits"
  [ -d "$AD" ] || { echo "ℹ️ no audits dir"; exit 0; }
  keep_pat='(v1-|v2-|v3-|traceability)'
  n_before=$(find "$AD" -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  (find "$AD" -type f -name "*.md" 2>/dev/null | rg -v "$keep_pat" || true) | while read -r f; do [ -n "$f" ] && rm -f "$f"; done
  n_after=$(find "$AD" -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  echo "🧹 audits cleanup (kept baselines): before=$n_before after=$n_after"
  exit 0
fi

if [ "$MODE" = "--enforce-no-audits" ]; then
  # keep baseline audits for future refactor/migration explanation
  keep_pat='(v1-|v2-|v3-|traceability)'
  n=$( (find "$PROOT/data/audits" -type f -name "*.md" 2>/dev/null | rg -v "$keep_pat" || true) | wc -l | tr -d ' ' )
  if [ "$n" -gt 0 ]; then
    echo "❌ non-baseline audits must be empty after fixes, found: $n"
    find "$PROOT/data/audits" -type f -name "*.md" 2>/dev/null | rg -v "$keep_pat" | sed 's/^/  audit: /' | head -n 100
    exit 1
  fi
  echo "✅ non-baseline audits empty (baseline audits retained)"
  exit 0
fi


echo "🔎 artifact lifecycle audit: $PROOT (mode=$MODE)"

if [ "$MODE" = "--tmp-only" ]; then
  n=$(find "$TMP_DIR" -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  echo "- tmp files: $n"
  find "$TMP_DIR" -type f -name "*.md" 2>/dev/null | sed 's/^/  tmp: /' | head -n 50 || true
  echo "✅ tmp-only audit done"
  exit 0
fi

check_count() {
  local label="$1"; local path="$2"; local pattern="$3"
  local n
  n=$(find "$path" -type f -name "$pattern" 2>/dev/null | wc -l | tr -d ' ')
  echo "- $label: $n"
}

check_count "tmp" "$PROOT/data/tmp" "TMP-*.md"
check_count "specs" "$PROOT/data/specs" "*.md"
check_count "plans" "$PROOT/data/plans" "*.md"
check_count "checkpoints" "$PROOT/data/checkpoints" "*.md"
check_count "audits" "$PROOT/data/audits" "*.md"
check_count "trackers" "$PROOT/data/progress" "TRACKER-*.md"

echo "\n⚠️ review hints"
find "$PROOT/data/tmp" -type f -name "TMP-*.md" 2>/dev/null | sed 's/^/  tmp: /' | head -n 30 || true
find "$PROOT/data/specs" -type f -name "*.md" 2>/dev/null | sed 's/^/  specs: /' | head -n 20 || true
find "$PROOT/data/plans" -type f -name "*.md" 2>/dev/null | sed 's/^/  plans: /' | head -n 20 || true
find "$PROOT/data/checkpoints" -type f -name "*.md" 2>/dev/null | sed 's/^/  checkpoints: /' | head -n 20 || true
find "$PROOT/data/progress" -type f -name "TRACKER-*.md" 2>/dev/null | sed 's/^/  tracker: /' | head -n 20 || true

echo "✅ artifact lifecycle audit done"
