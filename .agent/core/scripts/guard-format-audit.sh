#!/usr/bin/env bash
set -euo pipefail
F="${1:-}"; [ -f "$F" ] || { echo "file required"; exit 2; }
need=("🛡️ Guard 检查结果" "Scope 合规" "需求对照" "反猜测检查" "结论" "🧾 证据")
m=0; for k in "${need[@]}"; do rg -q "$k" "$F" || { echo "❌ missing: $k"; m=$((m+1)); }; done
[ $m -eq 0 ] && echo "✅ guard-format-audit passed" || { echo "❌ guard-format-audit failed: $m"; exit 1; }
