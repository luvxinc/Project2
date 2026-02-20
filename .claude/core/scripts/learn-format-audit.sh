#!/usr/bin/env bash
set -euo pipefail
F="${1:-}"; [ -f "$F" ] || { echo "file required"; exit 2; }
need=("📚 Learn 入库报告" "来源信息" "入库结果" "去重与更新" "风险/UNKNOWN" "🧾 证据")
m=0; for k in "${need[@]}"; do rg -q "$k" "$F" || { echo "❌ missing: $k"; m=$((m+1)); }; done
[ $m -eq 0 ] && echo "✅ learn-format-audit passed" || { echo "❌ learn-format-audit failed: $m"; exit 1; }
