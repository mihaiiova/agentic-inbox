#!/usr/bin/env bash
# Start local development server
# Usage: ./scripts/start-dev.sh [port]
# Default port: 8788

set -euo pipefail

PORT="${1:-8788}"
PIDFILE="/tmp/agentic-inbox-dev.pid"

# Kill any existing dev server
if [ -f "$PIDFILE" ]; then
	OLD_PID=$(cat "$PIDFILE" 2>/dev/null || true)
	if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
		echo "Stopping existing dev server (PID $OLD_PID)..."
		kill "$OLD_PID" 2>/dev/null || true
		sleep 2
	fi
	rm -f "$PIDFILE"
fi

# Clean up old wrangler processes on the same port
if lsof -ti:"$PORT" >/dev/null 2>&1; then
	echo "Killing process on port $PORT..."
	kill "$(lsof -ti:"$PORT")" 2>/dev/null || true
	sleep 1
fi

echo "=========================================="
echo "  Agentic Inbox — Local Dev Server"
echo "  Port: $PORT"
echo "  URL:  http://localhost:$PORT"
echo "=========================================="
echo ""

# Build first (required for wrangler dev to pick up changes)
echo "Building..."
npm run build

echo ""
echo "Starting wrangler dev in local mode..."
echo "Press Ctrl+C to stop"
echo ""

# Start wrangler dev in background, save PID
npx wrangler dev --local --port "$PORT" &
WRANGLER_PID=$!
echo $WRANGLER_PID > "$PIDFILE"

# Trap signals to clean up
cleanup() {
	echo ""
	echo "Shutting down dev server..."
	kill $WRANGLER_PID 2>/dev/null || true
	rm -f "$PIDFILE"
	wait $WRANGLER_PID 2>/dev/null || true
	echo "Done."
	exit 0
}
trap cleanup INT TERM EXIT

# Wait for server to be ready
echo "Waiting for server..."
for i in $(seq 1 30); do
	if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" | grep -q "200\|302"; then
		echo ""
		echo "Server ready at http://localhost:$PORT"
		echo ""
		break
	fi
	sleep 1
done

# Keep script running until interrupted
wait $WRANGLER_PID
