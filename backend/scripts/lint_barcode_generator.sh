#!/bin/bash
# File: scripts/lint_barcode_generator.sh
# 检查 barcode_generator.py 中是否有将 SKU 拼进 filename 的模式
# 这是禁止的，因为 SKU 可能含 "/" 会导致路径问题

set -e
cd /Users/aaron/Desktop/app/MGMT/backend

echo "=== Barcode Generator Lint Check ==="
echo ""

TARGET_FILE="apps/products/services/barcode_generator.py"

# 检查禁止的模式: f"{sku}." 或 sku + "." 用于 filename
FORBIDDEN_PATTERNS=(
    'filename.*=.*f.*{sku}'
    'filename.*=.*sku.*\+'
    '\.pdf.*=.*sku'
)

FAILED=0

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    if grep -qE "$pattern" "$TARGET_FILE" 2>/dev/null; then
        echo "❌ FOUND forbidden pattern: $pattern"
        grep -nE "$pattern" "$TARGET_FILE"
        FAILED=1
    fi
done

# 检查必须存在的模式: sku 应该作为目录
REQUIRED_PATTERNS=(
    'sku_dir.*=.*output_dir.*sku'
    'mkdir.*parents=True'
)

for pattern in "${REQUIRED_PATTERNS[@]}"; do
    if ! grep -qE "$pattern" "$TARGET_FILE" 2>/dev/null; then
        echo "❌ MISSING required pattern: $pattern"
        FAILED=1
    else
        echo "✅ Found required pattern: $pattern"
    fi
done

echo ""
if [ $FAILED -eq 1 ]; then
    echo "❌ LINT FAILED"
    exit 1
else
    echo "✅ ALL CHECKS PASSED"
    exit 0
fi
