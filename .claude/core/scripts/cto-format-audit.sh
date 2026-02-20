#!/usr/bin/env bash
set -euo pipefail
F="${1:-}"; [ -f "$F" ] || { echo "file required"; exit 2; }
need=("🎯" "📦" "🔗" "⚠️" "✅" "🧾 证据")
m=0; for k in "${need[@]}"; do rg -q "$k" "$F" || { echo "❌ missing: $k"; m=$((m+1)); }; done
[ $m -eq 0 ] && echo "✅ cto-format-audit passed" || { echo "❌ cto-format-audit failed: $m"; exit 1; }
