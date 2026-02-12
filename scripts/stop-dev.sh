#!/bin/bash
# MGMT V2 Development Server Stop Script
# Usage: ./scripts/stop-dev.sh

PROJECT_ROOT="/Users/aaron/Desktop/app/MGMTV2"

echo "🛑 Stopping MGMT V2 Development Servers..."
echo ""

# Method 1: Kill by saved PID
if [ -f /tmp/mgmt-api.pid ]; then
    API_PID=$(cat /tmp/mgmt-api.pid)
    if kill -0 $API_PID 2>/dev/null; then
        echo "   Stopping API server (PID: $API_PID)..."
        kill $API_PID 2>/dev/null || true
    fi
    rm -f /tmp/mgmt-api.pid
fi

if [ -f /tmp/mgmt-web.pid ]; then
    WEB_PID=$(cat /tmp/mgmt-web.pid)
    if kill -0 $WEB_PID 2>/dev/null; then
        echo "   Stopping Web server (PID: $WEB_PID)..."
        kill $WEB_PID 2>/dev/null || true
    fi
    rm -f /tmp/mgmt-web.pid
fi

# Method 2: Kill by port (fallback)
echo ""
echo "   Cleaning up ports..."

# Kill processes on port 3000 (Next.js)
PORT_3000_PID=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$PORT_3000_PID" ]; then
    echo "   Killing process on port 3000 (PID: $PORT_3000_PID)..."
    kill -9 $PORT_3000_PID 2>/dev/null || true
fi

# Kill processes on port 3001 (NestJS)
PORT_3001_PID=$(lsof -ti :3001 2>/dev/null || true)
if [ -n "$PORT_3001_PID" ]; then
    echo "   Killing process on port 3001 (PID: $PORT_3001_PID)..."
    kill -9 $PORT_3001_PID 2>/dev/null || true
fi

# Kill any remaining node processes related to the project
pkill -f "nest start" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

# Clean up log files (optional)
# rm -f /tmp/mgmt-api.log /tmp/mgmt-web.log

echo ""
echo "✅ All servers stopped."
echo ""
