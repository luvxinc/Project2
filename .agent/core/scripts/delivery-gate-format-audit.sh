#!/usr/bin/env bash
set -euo pipefail

# delivery-gate-format-audit.sh <report-file>
F="${1:-}"
[ -f "$F" ] || { echo "report file required"; exit 2; }

need=(
  "📋 交付闸门"
  "编译通过"
  "需求逐条对照"
  "CSS 布局无异常"
  "i18n 覆盖"
  "🔴 功能验证"
)

miss=0
for k in "${need[@]}"; do
  if ! rg -q "$k" "$F"; then
    echo "❌ missing: $k"
    miss=$((miss+1))
  fi
done

if [ $miss -gt 0 ]; then
  echo "❌ delivery-gate-format-audit failed: $miss missing"
  exit 1
fi

echo "✅ delivery-gate-format-audit passed"