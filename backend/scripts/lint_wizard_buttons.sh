#!/bin/bash
# File: scripts/lint_wizard_buttons.sh
# 检查向导页面中的所有按钮是否都有事件绑定
# 使用方法: ./scripts/lint_wizard_buttons.sh

set -e
cd /Users/aaron/Desktop/app/MGMT/backend/templates

echo "=== Wizard Button Binding Lint Check ==="
echo ""

FAILED=0

for file in $(find . -name "*.html" -exec grep -l "wizard-step-content" {} \;); do
    echo "📄 Checking: $file"
    
    # 提取所有 btn-step 开头的按钮 id
    BUTTONS=$(grep -oE 'id="btn-step[^"]*"' "$file" 2>/dev/null | sed 's/id="//g' | sed 's/"//g' || true)
    
    if [ -z "$BUTTONS" ]; then
        echo "   ⚠️  No btn-step* buttons found"
        continue
    fi
    
    for btn in $BUTTONS; do
        # 检查是否有对应的 addEventListener
        if ! grep -q "getElementById('$btn').addEventListener" "$file"; then
            echo "   ❌ MISSING: $btn has no addEventListener"
            FAILED=1
        else
            echo "   ✅ OK: $btn"
        fi
    done
    
    # 额外检查: btn-step2-submit 必须有状态更新函数调用
    if grep -q 'id="btn-step2-submit"' "$file"; then
        if ! grep -q "btn-step2-submit.*disabled\s*=" "$file"; then
            echo "   ⚠️  WARN: btn-step2-submit exists but no disabled state management found"
        else
            echo "   ✅ OK: btn-step2-submit has disabled state management"
        fi
    fi
    
    echo ""
done

if [ $FAILED -eq 1 ]; then
    echo "❌ LINT FAILED: Some buttons missing event bindings"
    exit 1
else
    echo "✅ ALL WIZARD BUTTONS HAVE EVENT BINDINGS"
    exit 0
fi
