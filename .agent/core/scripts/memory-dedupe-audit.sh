#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:-/Users/aaron/Developer/MGMTV2/.agent/projects/mgmt}"
ERR="$PROJECT_ROOT/data/errors/ERROR-BOOK.md"
MEM="$PROJECT_ROOT/data/progress/PROJECT-MEMORY.md"

audit_file() {
  local f="$1"
  local name="$2"
  if [ ! -f "$f" ]; then
    echo "⚠️  $name missing: $f"
    return 0
  fi

  local dups
  dups=$(rg -n "^[- ]*fingerprint:\s*" "$f" | sed -E 's/^[0-9]+://; s/^[- ]*fingerprint:\s*//; s/\s+$//' | sort | uniq -cd || true)
  if [ -n "$dups" ]; then
    echo "❌ Duplicate fingerprints in $name:"
    echo "$dups"
    return 1
  else
    echo "✅ $name fingerprint uniqueness passed"
  fi
}

echo "🔎 Memory dedupe audit: $PROJECT_ROOT"
audit_file "$ERR" "ERROR-BOOK"
audit_file "$MEM" "PROJECT-MEMORY"
echo "✅ Memory dedupe audit done"
