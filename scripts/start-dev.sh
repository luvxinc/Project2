#!/bin/bash
# MGMT V2 Development Server Startup Script
# Usage: ./scripts/start-dev.sh

set -e

PROJECT_ROOT="/Users/aaron/Desktop/app/MGMTV2"
cd "$PROJECT_ROOT"

echo "🚀 Starting MGMT V2 Development Servers..."
echo ""

# Check if ports are already in use
if lsof -i :3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 is already in use. Please run ./scripts/stop-dev.sh first."
    exit 1
fi

if lsof -i :3001 >/dev/null 2>&1; then
    echo "⚠️  Port 3001 is already in use. Please run ./scripts/stop-dev.sh first."
    exit 1
fi

# Start API server in background
echo "📦 Starting API Server (NestJS) on port 3001..."
pnpm --filter api dev > /tmp/mgmt-api.log 2>&1 &
API_PID=$!
echo "   API PID: $API_PID"

# Wait for API to be ready
sleep 3

# Start Web server in background
echo "🌐 Starting Web Server (Next.js) on port 3000..."
pnpm --filter web dev > /tmp/mgmt-web.log 2>&1 &
WEB_PID=$!
echo "   Web PID: $WEB_PID"

# Save PIDs to file
echo "$API_PID" > /tmp/mgmt-api.pid
echo "$WEB_PID" > /tmp/mgmt-web.pid

# Wait for servers to be ready
echo ""
echo "⏳ Waiting for servers to start..."
sleep 5

echo ""
echo "✅ Servers started successfully!"
echo ""
echo "   📋 API Server:  http://localhost:3001"
echo "   🌐 Web Server:  http://localhost:3000"
echo ""
echo "   📄 API Logs:    tail -f /tmp/mgmt-api.log"
echo "   📄 Web Logs:    tail -f /tmp/mgmt-web.log"
echo ""
echo "   🛑 To stop:     ./scripts/stop-dev.sh"
echo ""
