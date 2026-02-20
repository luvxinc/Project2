#!/usr/bin/env bash
set -euo pipefail

# Scope audit: ensure changed files stay within allowlist
# Usage:
#   scope-audit.sh <allowlist-file> [base-ref]
# allowlist-file: one regex per line (comments with #)

ALLOWLIST="${1:-}"
BASE_REF="${2:-HEAD~1}"

[ -f "$ALLOWLIST" ] || { echo "allowlist file not found: $ALLOWLIST"; exit 2; }

changed=$(git diff --name-only "$BASE_REF"...HEAD || true)
[ -n "$changed" ] || { echo "✅ scope-audit: no changed files"; exit 0; }

violations=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  ok=0
  while IFS= read -r rule; do
    rule="${rule%%#*}"
    rule="$(echo "$rule" | xargs || true)"
    [ -z "$rule" ] && continue
    if echo "$f" | rg -q "$rule"; then ok=1; break; fi
  done < "$ALLOWLIST"

  if [ "$ok" -eq 0 ]; then
    echo "❌ out-of-scope: $f"
    violations=$((violations+1))
  fi
done <<< "$changed"

if [ "$violations" -gt 0 ]; then
  echo "❌ scope-audit failed: $violations violation(s)"
  exit 1
fi

echo "✅ scope-audit passed"
