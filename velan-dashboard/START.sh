#!/bin/bash
echo "Starting Velan Dashboard..."
cd "$(dirname "$0")/backend"
node server.js &
SERVER_PID=$!
echo "Backend running (PID $SERVER_PID)"
echo ""
npx serve ../frontend
echo "  API health:     http://localhost:3001/api/health"
echo "  WebSocket:      ws://localhost:3002"
echo ""
echo "Press Ctrl+C to stop."
trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
