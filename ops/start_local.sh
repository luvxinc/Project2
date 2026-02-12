#!/bin/bash

# ==============================================================================
# Eaglestar ERP - Local Development Server Startup Script
# ==============================================================================
# 用法: bash ops/start_local.sh
# 说明: 仅启动 Django 本地开发服务器 (127.0.0.1:8000)，不启动 Cloudflare Tunnel
# 
# 注意: 使用 --noreload 避免 Django autoreloader 与 SQLAlchemy 的循环导入冲突
# ==============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "🚀 Eaglestar ERP - Starting Local Development Server..."

# 1. Activate Virtual Environment
if [ -d "$PROJECT_ROOT/.venv" ]; then
    echo "🟢 Activating .venv..."
    source "$PROJECT_ROOT/.venv/bin/activate"
elif [ -d "$PROJECT_ROOT/venv" ]; then
    echo "🟢 Activating venv..."
    source "$PROJECT_ROOT/venv/bin/activate"
fi

# 2. Kill any existing Django processes on port 8000
echo "🧹 Cleaning up existing Django processes..."
pkill -f "python manage.py runserver" 2>/dev/null || true
sleep 1

# 3. Start Django Server
echo "🧠 Starting Django Server (Port 8000)..."
cd "$BACKEND_DIR"
python manage.py runserver 127.0.0.1:8000
