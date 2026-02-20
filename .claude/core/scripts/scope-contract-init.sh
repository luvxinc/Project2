#!/usr/bin/env bash
set -euo pipefail

# Initialize per-task scope contract (dynamic allowlist)
# Usage:
#   scope-contract-init.sh <project-root> <task-id> <base-ref> <regex1> [regex2 ...]

PROOT="${1:-}"
TASK_ID="${2:-}"
BASE_REF="${3:-}"
shift 3 || true

[ -n "$PROOT" ] || { echo "project-root required"; exit 2; }
[ -n "$TASK_ID" ] || { echo "task-id required"; exit 2; }
[ -n "$BASE_REF" ] || { echo "base-ref required"; exit 2; }
[ "$#" -gt 0 ] || { echo "at least one allowlist regex required"; exit 2; }

DIR="$PROOT/data/tmp/$TASK_ID"
FILE="$DIR/scope-contract.txt"
mkdir -p "$DIR"

{
  echo "# scope contract"
  echo "TASK_ID=$TASK_ID"
  echo "BASE_REF=$BASE_REF"
  echo "# allowlist regex below"
  for r in "$@"; do
    echo "$r"
  done
} > "$FILE"

echo "$FILE"
