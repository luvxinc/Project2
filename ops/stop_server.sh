#!/bin/bash

# ==============================================================================
# Eaglestar ERP - Server Shutdown Script
# ==============================================================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PID_DIR="$SCRIPT_DIR"

DJANGO_PID_FILE="$PID_DIR/django.pid"
TUNNEL_PID_FILE="$PID_DIR/tunnel.pid"

echo "🛑 Eaglestar ERP - Stopping Services..."

# 1. Stop Django Server
if [ -f "$DJANGO_PID_FILE" ]; then
    PID=$(cat "$DJANGO_PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        kill -9 $PID 2>/dev/null
        echo "✅ Stopped Django Server (PID: $PID)"
    else
        echo "⚠️  Django process not running."
    fi
    rm -f "$DJANGO_PID_FILE"
else
    echo "ℹ️  No Django PID file found."
fi

# 2. Stop Cloudflare Tunnel
if [ -f "$TUNNEL_PID_FILE" ]; then
    PID=$(cat "$TUNNEL_PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        kill -9 $PID 2>/dev/null
        echo "✅ Stopped Cloudflare Tunnel (PID: $PID)"
    else
        echo "⚠️  Tunnel process not running."
    fi
    rm -f "$TUNNEL_PID_FILE"
else
    echo "ℹ️  No Tunnel PID file found."
fi

# 3. Force cleanup ALL related orphaned processes (防止僵尸进程)
echo "🧹 Force cleaning ALL orphaned processes..."

# Django - 使用 kill -9 强制终止
LEFTOVER_DJANGO=$(pgrep -f "manage.py runserver" 2>/dev/null || true)
if [ -n "$LEFTOVER_DJANGO" ]; then
    echo "   → Force killing orphaned Django: $LEFTOVER_DJANGO"
    echo "$LEFTOVER_DJANGO" | xargs kill -9 2>/dev/null || true
fi

# Cloudflare
LEFTOVER_CF=$(pgrep -f "cloudflared" 2>/dev/null || true)
if [ -n "$LEFTOVER_CF" ]; then
    echo "   → Force killing orphaned Cloudflare: $LEFTOVER_CF"
    echo "$LEFTOVER_CF" | xargs kill -9 2>/dev/null || true
fi

# Caffeinate
LEFTOVER_CAF=$(pgrep -f "caffeinate.*python" 2>/dev/null || true)
if [ -n "$LEFTOVER_CAF" ]; then
    echo "   → Force killing orphaned caffeinate: $LEFTOVER_CAF"
    echo "$LEFTOVER_CAF" | xargs kill -9 2>/dev/null || true
fi

# 4. 等待进程完全退出
sleep 1

# 5. 最终确认
REMAINING=$(pgrep -f "manage.py runserver" 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
    echo "⚠️  Warning: Some processes still running: $REMAINING"
    echo "   → Attempting final force kill..."
    echo "$REMAINING" | xargs kill -9 2>/dev/null || true
    sleep 1
fi

echo "=================================================="
echo "😴 All services stopped. Sleep prevention disabled."
echo "=================================================="

