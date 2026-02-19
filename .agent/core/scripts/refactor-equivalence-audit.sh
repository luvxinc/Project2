#!/usr/bin/env bash
set -euo pipefail

# Refactor equivalence audit v1
# Usage: refactor-equivalence-audit.sh <matrix-file>

MATRIX="${1:-}"
[ -n "$MATRIX" ] || { echo "matrix-file required"; exit 2; }
[ -f "$MATRIX" ] || { echo "not found: $MATRIX"; exit 2; }

# required columns in markdown table header
required=("Requirement" "Before" "After" "Evidence" "Status")
header=$(rg -n '^\|.*\|' "$MATRIX" | head -n 1 | cut -d: -f2- || true)
[ -n "$header" ] || { echo "❌ no markdown table header"; exit 1; }

for col in "${required[@]}"; do
  if ! echo "$header" | grep -q "$col"; then
    echo "❌ missing column: $col"
    exit 1
  fi
done

rows=$(rg '^\|.*\|' "$MATRIX" | tail -n +3 || true)
[ -n "$rows" ] || { echo "❌ no data rows"; exit 1; }

bad=0
while IFS= read -r r; do
  # naive split
  req=$(echo "$r" | awk -F'|' '{print $2}' | xargs)
  bef=$(echo "$r" | awk -F'|' '{print $3}' | xargs)
  aft=$(echo "$r" | awk -F'|' '{print $4}' | xargs)
  evd=$(echo "$r" | awk -F'|' '{print $5}' | xargs)
  st=$(echo "$r" | awk -F'|' '{print $6}' | xargs)
  [ -z "$req" ] && continue
  if [ -z "$bef" ] || [ -z "$aft" ] || [ -z "$evd" ] || [ -z "$st" ]; then
    echo "❌ incomplete row: $r"
    bad=$((bad+1))
    continue
  fi
  case "$st" in
    PASS|FAIL|UNKNOWN) ;;
    *) echo "❌ invalid status($st): $r"; bad=$((bad+1));;
  esac
  if [ "$st" = "UNKNOWN" ]; then
    echo "⚠️ unknown row: $r"
  fi
done <<< "$rows"

if [ "$bad" -gt 0 ]; then
  echo "❌ equivalence audit failed: bad_rows=$bad"
  exit 1
fi

echo "✅ equivalence audit passed"
