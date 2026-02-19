#!/usr/bin/env bash
set -euo pipefail

# Audit changes against per-task scope contract
# Usage:
#   scope-contract-audit.sh <contract-file>

CONTRACT="${1:-}"
[ -f "$CONTRACT" ] || { echo "contract not found: $CONTRACT"; exit 2; }

BASE_REF=$(rg '^BASE_REF=' "$CONTRACT" | head -n1 | cut -d= -f2-)
[ -n "$BASE_REF" ] || { echo "BASE_REF missing in contract"; exit 2; }

RULES=$(grep -v '^#' "$CONTRACT" | grep -v '^TASK_ID=' | grep -v '^BASE_REF=' | sed '/^\s*$/d' || true)
[ -n "$RULES" ] || { echo "no allowlist rules in contract"; exit 2; }

changed=$(git diff --name-only "$BASE_REF"...HEAD || true)
[ -n "$changed" ] || { echo "✅ scope-contract-audit: no changed files"; exit 0; }

violations=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  ok=0
  while IFS= read -r rule; do
    if echo "$f" | rg -q "$rule"; then ok=1; break; fi
  done <<< "$RULES"
  if [ "$ok" -eq 0 ]; then
    echo "❌ out-of-scope: $f"
    violations=$((violations+1))
  fi
done <<< "$changed"

if [ "$violations" -gt 0 ]; then
  echo "❌ scope-contract-audit failed: $violations"
  exit 1
fi

echo "✅ scope-contract-audit passed"
