#!/bin/bash
echo "🛑 Killing port 3002 (Faucet Service)..."
kill -9 $(lsof -t -i:3002) 2>/dev/null || true

# Enter script directory
cd "$(dirname "$0")" || exit

echo "🚀 Starting Faucet Service in FOREGROUND..."
echo "👀 Watch the logs below to see where it hangs!"
echo "---------------------------------------------------"

# Run directedly attached to terminal
npx tsx faucet_service.ts
