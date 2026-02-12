#!/bin/bash
# 🔒 不朽凭证快速恢复脚本
# 用法: ./scripts/restore-credentials.sh

set -e

PROJECT_ROOT="/Users/aaron/Desktop/app/MGMTV2"
cd "$PROJECT_ROOT/apps/api"

echo ""
echo "🔒 正在恢复不朽凭证..."
echo ""

npx ts-node ../../scripts/restore-credentials.ts

echo "✅ 完成! 现在可以使用 admin / 1522P 登录"
echo ""
