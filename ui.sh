#!/bin/bash
echo "🛑 Killing port 3001 (Demo UI)..."
kill -9 $(lsof -t -i:3001) 2>/dev/null || true

echo "🚀 Starting Demo UI in BACKGROUND..."
# Output redirected to log file
npx tsx demo_ui.ts > demo_ui.log 2>&1 &

echo "✅ Demo UI is running. logs are being written to demo_ui.log"
