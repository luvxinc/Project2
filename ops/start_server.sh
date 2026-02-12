#!/bin/bash

# ==============================================================================
# Eaglestar ERP - Server Startup Script (Django + Cloudflare)
# ==============================================================================

set -e

# Path Setup
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$SCRIPT_DIR"

# PID Files
DJANGO_PID_FILE="$PID_DIR/django.pid"
TUNNEL_PID_FILE="$PID_DIR/tunnel.pid"

# Cloudflare Token (Updated: 2025-12-23)
CF_TOKEN="***REDACTED_CF_TOKEN***"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

echo "🚀 Eaglestar ERP - Starting Services..."

# 1. Activate Virtual Environment
if [ -d "$PROJECT_ROOT/.venv" ]; then
    echo "🟢 Activating .venv..."
    source "$PROJECT_ROOT/.venv/bin/activate"
elif [ -d "$PROJECT_ROOT/venv" ]; then
    echo "🟢 Activating venv..."
    source "$PROJECT_ROOT/venv/bin/activate"
fi

# 2. Clean up any existing processes
if [ -f "$DJANGO_PID_FILE" ]; then
    OLD_PID=$(cat "$DJANGO_PID_FILE")
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "⚠️  Stopping existing Django process (PID: $OLD_PID)..."
        kill $OLD_PID 2>/dev/null || true
    fi
    rm -f "$DJANGO_PID_FILE"
fi

if [ -f "$TUNNEL_PID_FILE" ]; then
    OLD_PID=$(cat "$TUNNEL_PID_FILE")
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "⚠️  Stopping existing Tunnel process (PID: $OLD_PID)..."
        kill $OLD_PID 2>/dev/null || true
    fi
    rm -f "$TUNNEL_PID_FILE"
fi

# 3. Start Cloudflare Tunnel
echo "🌐 [1/2] Starting Cloudflare Tunnel..."
nohup cloudflared tunnel run --token $CF_TOKEN > "$LOG_DIR/cloudflared.log" 2>&1 &
TUNNEL_PID=$!
echo $TUNNEL_PID > "$TUNNEL_PID_FILE"
echo "   → Tunnel PID: $TUNNEL_PID"

# 4. Start Django Server
echo "🧠 [2/2] Starting Django Server (Port 8000)..."
cd "$BACKEND_DIR"
nohup caffeinate -ims python manage.py runserver 0.0.0.0:8000 > "$LOG_DIR/django_runtime.log" 2>&1 &
DJANGO_PID=$!
echo $DJANGO_PID > "$DJANGO_PID_FILE"
echo "   → Django PID: $DJANGO_PID"

# Wait a moment to verify startup
sleep 2

# Check if processes are running
if ps -p $DJANGO_PID > /dev/null && ps -p $TUNNEL_PID > /dev/null; then
    echo "=================================================="
    echo "✅ Eaglestar ERP Started Successfully!"
    echo "   • Django Server : PID $DJANGO_PID (Port 8000)"
    echo "   • Cloudflare    : PID $TUNNEL_PID"
    echo "--------------------------------------------------"
    echo "📄 Logs: $LOG_DIR/"
    echo "🔒 Sleep prevention: ENABLED (caffeinate)"
    echo "=================================================="
else
    echo "❌ Error: One or more services failed to start."
    echo "   Check logs in $LOG_DIR/"
    exit 1
fi
