#!/usr/bin/env bash
set -euo pipefail
F="${1:-}"; [ -f "$F" ] || { echo "file required"; exit 2; }
need=("📊 审计总览" "🚫 阻断项" "✅ 通过项" "🧾 证据" "🏁 Verdict")
m=0; for k in "${need[@]}"; do rg -q "$k" "$F" || { echo "❌ missing: $k"; m=$((m+1)); }; done
[ $m -eq 0 ] && echo "✅ qa-format-audit passed" || { echo "❌ qa-format-audit failed: $m"; exit 1; }
