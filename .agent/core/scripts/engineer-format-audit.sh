#!/usr/bin/env bash
set -euo pipefail
F="${1:-}"; [ -f "$F" ] || { echo "file required"; exit 2; }
need=("✅ 完工摘要" "📁 变更文件清单" "🧪 验证结果" "🧭 影响半径" "❓ UNKNOWN" "🧾 证据")
m=0; for k in "${need[@]}"; do rg -q "$k" "$F" || { echo "❌ missing: $k"; m=$((m+1)); }; done
[ $m -eq 0 ] && echo "✅ engineer-format-audit passed" || { echo "❌ engineer-format-audit failed: $m"; exit 1; }
