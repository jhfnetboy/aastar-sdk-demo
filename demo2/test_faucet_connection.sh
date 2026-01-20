#!/bin/bash

# cd to script dir
cd "$(dirname "$0")"

# Load env
source ../.env.sepolia

echo "🧪 Testing Faucet Connection..."
echo "URL: $FAUCET_URL"
echo "SECRET: ${FAUCET_SECRET:0:4}****"

# Test Payload (Random Address)
TARGET="0x1111111111111111111111111111111111111111"

# Curl
curl -X POST "$FAUCET_URL" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $FAUCET_SECRET" \
     -d "{\"target\": \"$TARGET\"}" \
     -v
