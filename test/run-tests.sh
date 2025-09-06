#!/bin/bash

echo "🚀 Starting Unwallet SDK Tests..."
echo ""

echo "=================================================="
echo "TEST 1: Stealth Address Generation"
echo "=================================================="
node --loader ts-node/esm -r dotenv/config src/test-stealth-address.ts

echo ""
echo "=================================================="
echo "TEST 2: Transaction Data Fetching"
echo "=================================================="
node --loader ts-node/esm -r dotenv/config src/test-transactions.ts

echo ""
echo "=================================================="
echo "TEST 3: Payment Processing"
echo "=================================================="
node --loader ts-node/esm -r dotenv/config src/test-payment.ts

echo ""
echo "=================================================="
echo "✅ All tests completed!"
echo "=================================================="
