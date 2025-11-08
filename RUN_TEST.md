# How to Run the EIP-3009 Gasless Deposit Test

## Prerequisites

1. **Build the SDK package** (if not already built):
   ```bash
   cd package
   pnpm install
   pnpm build
   ```

2. **Install test dependencies**:
   ```bash
   cd ../test
   pnpm install
   ```

3. **Set up environment variables** in `test/.env`:
   ```bash
   # Required: Your account with ETH and USDC on Base Sepolia
   TEST_PRIVATE_KEY=0xYourPrivateKeyHere
   
   # Optional: Override RPC URLs
   BASE_SEPOLIA_RPC=https://sepolia.base.org
   ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
   
   # Optional: Override API server URL (defaults to https://tee.wall8.xyz)
   TEST_SERVER_URL=http://localhost:3000
   # or
   SERVER_URL=https://tee.wall8.xyz
   
   # Optional: API key (defaults to 'test-gasless-deposit-eip3009')
   API_KEY=your-api-key
   ```

## Running the Test

### Option 1: Using npm script (Recommended)
```bash
cd test
pnpm test:gasless-deposit-eip3009
```

### Option 2: Direct node command
```bash
cd test
node --loader ts-node/esm -r dotenv/config src/test-gasless-deposit-eip3009.ts
```

### Option 3: Using tsx (if installed)
```bash
cd test
npx tsx src/test-gasless-deposit-eip3009.ts
```

## What the Test Does

1. ✅ Creates a random account with **ZERO ETH** (completely gasless!)
2. ✅ Creates orchestration request (random account owns smart accounts)
3. ✅ Transfers USDC from your account → random account
4. ✅ Signs EIP-3009 authorization **off-chain** (no gas needed!)
5. ✅ Notifies server with signed authorization
6. ✅ Polls orchestration status until complete
7. ✅ Displays final summary with smart account addresses

## Expected Output

The test will show:
- Random account address and private key (save this if you want to use the smart accounts later!)
- Orchestration request details
- Transfer hash
- Authorization signature details
- Orchestration status updates
- Final summary with all addresses

## Troubleshooting

### "Insufficient USDC"
- Ensure your account has at least 0.1 USDC on Base Sepolia
- Get testnet USDC from: https://faucet.circle.com/

### "Server not responding"
- Check if the server is running (if using localhost)
- Verify `TEST_SERVER_URL` or `SERVER_URL` is correct

### TypeScript errors
- These are usually type-level issues and won't prevent the test from running
- The test uses `ts-node` which handles TypeScript at runtime

## Notes

- The random account needs **ZERO ETH** - this is the key feature!
- The random account **owns** both smart accounts (source and destination)
- Save the private key displayed in the output if you want to use the smart accounts later
- The server executes everything in a Multicall3 batch (server pays all gas)
