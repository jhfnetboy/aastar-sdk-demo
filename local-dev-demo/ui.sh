#!/bin/bash
echo "🛑 Killing port 3001 (Demo UI)..."
kill -9 $(lsof -t -i:3001) 2>/dev/null || true

# Enter script directory
cd "$(dirname "$0")" || exit

echo "🚀 Starting Demo UI in BACKGROUND..."
# Output redirected to log file
# npx tsx demo_ui.ts > demo_ui.log 2>&1 &
npx tsx demo_ui.ts
echo "✅ Demo UI is running. logs are being written to demo2/demo_ui.log"
