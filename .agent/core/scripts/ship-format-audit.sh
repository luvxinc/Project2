#!/usr/bin/env bash
set -euo pipefail
F="${1:-}"; [ -f "$F" ] || { echo "file required"; exit 2; }
need=("🚢 发布就绪报告" "构建与制品" "部署前检查" "风险与窗口" "结论" "🧾 证据")
m=0; for k in "${need[@]}"; do rg -q "$k" "$F" || { echo "❌ missing: $k"; m=$((m+1)); }; done
[ $m -eq 0 ] && echo "✅ ship-format-audit passed" || { echo "❌ ship-format-audit failed: $m"; exit 1; }
