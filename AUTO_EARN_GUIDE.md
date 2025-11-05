# AutoEarn: Base to Arbitrum USDC Bridge

This guide shows how to use the Unwallet SDK to bridge USDC from Base Sepolia to Arbitrum Sepolia and automatically invest it in Aave using the AutoEarn module.

## Two Approaches

The SDK supports **two approaches** for building modules:

1. **Client-Side Encoding** (Manual) - You encode module data yourself using SDK helpers
2. **Server-Side API** (Recommended) - Server handles encoding, validation, and address lookup

This guide shows both approaches. The server-side API is recommended as it's simpler and more maintainable.

## Prerequisites

- Node.js 18+ or Bun
- A wallet with USDC on Base Sepolia
- Server running (or use production server)

## Setup

```bash
npm install unwallet
# or
pnpm add unwallet
```

## Environment Variables

```bash
# Required: Private key of account with USDC on Base Sepolia
TEST_PRIVATE_KEY=0xYourPrivateKeyHere

# Optional: API key (defaults to "test-api-orchestration")
API_KEY=test-api-orchestration

# Optional: Server URL (defaults to production)
TEST_SERVER_URL=http://localhost:3000
```

## Approach 1: Server-Side API with Fallback (Recommended)

Use the server-side Module Builder API for simplicity. If the server API is not available, the SDK automatically falls back to client-side encoding.

```typescript
import {
  createOrchestrationData,
  transferToOrchestrationAccount,
  notifyDeposit,
  pollOrchestrationStatus,
  getRequiredState,
  buildAutoEarnModule, // Server-side API
  encodeAutoEarnModuleData, // Fallback helpers
  createAutoEarnConfig,
} from 'unwallet';
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia } from 'viem/chains';

// Network configuration
const NETWORKS = {
  baseSepolia: {
    rpcUrl: 'https://sepolia.base.org',
    usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  arbitrumSepolia: {
    usdcToken: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
    aavePool: '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff',
  },
};

async function enableAutoEarn() {
  // 1. Setup clients and accounts
  const privateKey = process.env.TEST_PRIVATE_KEY!;
  const fundingAccount = privateKeyToAccount(privateKey as `0x${string}`);
  
  const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: http(NETWORKS.baseSepolia.rpcUrl),
  });

  const baseWalletClient = createWalletClient({
    account: fundingAccount,
    chain: baseSepolia,
    transport: http(NETWORKS.baseSepolia.rpcUrl),
  });

  // 2. Get required state (needed for orchestration metadata)
  const requiredState = await getRequiredState({
    sourceChainId: arbitrumSepolia.id,
    moduleName: 'AUTOEARN',
  });

  // 3. Build AutoEarn module - try server API first, fallback to client-side
  let encodedData: string;
  
  try {
    // Try server-side API first (simpler - server handles encoding)
    console.log('🔧 Building AutoEarn module using server API...');
    const autoEarnModule = await buildAutoEarnModule({
      chainId: arbitrumSepolia.id,
      tokenAddress: NETWORKS.arbitrumSepolia.usdcToken,
      // vaultAddress is optional - server uses default Aave pool
    }, {
      baseUrl: process.env.TEST_SERVER_URL || 'http://localhost:3000',
    });
    encodedData = autoEarnModule.data;
    console.log(`✅ AutoEarn module built via server API: ${autoEarnModule.address}`);
  } catch (error) {
    // Fallback to client-side encoding if server API is not available
    console.log('⚠️  Server API not available, using client-side encoding...');
    const autoEarnConfig = createAutoEarnConfig(
      arbitrumSepolia.id,
      NETWORKS.arbitrumSepolia.usdcToken,
      NETWORKS.arbitrumSepolia.aavePool, // Must provide vault address manually
    );
    encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
    console.log(`✅ AutoEarn module encoded client-side: ${requiredState.moduleAddress}`);
  }

  // 4. Create orchestration request
  const bridgeAmount = parseUnits('0.1', 6); // 0.1 USDC
  const orchestrationData = await createOrchestrationData(
    {
      chainId: baseSepolia.id,
      tokenAddress: NETWORKS.baseSepolia.usdcToken,
      tokenAmount: bridgeAmount.toString(),
      ownerAddress: fundingAccount.address,
    },
    requiredState, // Use requiredState which has all metadata
    fundingAccount.address,
    process.env.API_KEY || 'test-api-orchestration',
    encodedData, // Use encoded data (from server or client)
  );

  console.log(`✅ Orchestration created: ${orchestrationData.requestId}`);
  console.log(`📍 Source Account: ${orchestrationData.accountAddressOnSourceChain}`);
  console.log(`📍 Destination Account: ${orchestrationData.accountAddressOnDestinationChain}`);
  console.log(`🔧 Destination Modules: ${orchestrationData.destinationChainAccountModules.join(', ')}`);

  // 5. Transfer USDC to orchestration account
  const depositResult = await transferToOrchestrationAccount(
    orchestrationData,
    baseWalletClient,
    baseClient,
  );

  if (!depositResult.success || !depositResult.txHash) {
    throw new Error(`Transfer failed: ${depositResult.error}`);
  }

  // 6. Get transaction receipt
  const receipt = await baseClient.waitForTransactionReceipt({
    hash: depositResult.txHash as `0x${string}`,
  });

  // 7. Notify server of deposit
  await notifyDeposit({
    requestId: orchestrationData.requestId,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
  });

  console.log('✅ Server notified successfully!');

  // 8. Poll orchestration status
  await pollOrchestrationStatus({
    requestId: orchestrationData.requestId,
    interval: 3000,
    maxAttempts: 100,
    onStatusUpdate: (status) => {
      console.log(`Status: ${status.status}`);
    },
    onComplete: (status) => {
      console.log('🎉 Orchestration completed!');
    },
    onError: (error) => {
      console.error('❌ Error:', error.message);
    },
  });
}

// Run it
enableAutoEarn().catch(console.error);
```

## Approach 2: Client-Side Encoding Only (Manual)

If you prefer to always use client-side encoding (no server dependency), you can skip the server API call:

```typescript
import {
  createOrchestrationData,
  transferToOrchestrationAccount,
  notifyDeposit,
  pollOrchestrationStatus,
  getRequiredState,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from 'unwallet';

// ... (same setup as Approach 1)

// 2. Get required state for AutoEarn module
const requiredState = await getRequiredState({
  sourceChainId: arbitrumSepolia.id,
  moduleName: 'AUTOEARN',
});

// 3. Create and encode AutoEarn configuration manually
const autoEarnConfig = createAutoEarnConfig(
  arbitrumSepolia.id, // Arbitrum Sepolia chain ID
  NETWORKS.arbitrumSepolia.usdcToken,
  NETWORKS.arbitrumSepolia.aavePool, // Must provide vault address
);
const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);

// 4. Create orchestration (rest is same as Approach 1)
const orchestrationData = await createOrchestrationData(
  currentState,
  requiredState,
  fundingAccount.address,
  process.env.API_KEY || 'test-api-orchestration',
  encodedData,
);
```

## Comparison: Server-Side vs Client-Side

| Feature | Server-Side API (with Fallback) | Client-Side Only |
|---------|----------------|---------------------|
| **Simplicity** | ✅ Just provide params, auto-fallback | ⚠️ Need to encode data manually |
| **Module Address** | ✅ Server handles, or from `getRequiredState` | ⚠️ Must use `getRequiredState` |
| **Validation** | ✅ Server validates if available | ⚠️ Manual validation |
| **Maintenance** | ✅ Server updates, fallback always works | ⚠️ SDK updates needed |
| **Offline Support** | ✅ Works offline (auto-fallback) | ✅ Works offline |
| **Reliability** | ✅ Best of both worlds | ⚠️ Manual maintenance |

**Recommendation:** Use **Approach 1 (Server-Side with Fallback)** - it automatically tries the server API first, and falls back to client-side encoding if the server is unavailable. This gives you the best of both worlds.

## Workflow Steps

1. **Setup**: Initialize clients and accounts
2. **Get Required State**: Fetch AutoEarn module requirements for Arbitrum Sepolia (needed for metadata)
3. **Build Module**: Try server API first, fallback to client-side encoding if needed
4. **Create Orchestration**: Send request to server to create orchestration with encoded module data
5. **Transfer Tokens**: Transfer USDC to the computed source account address
6. **Notify Server**: Tell the server about the deposit
7. **Monitor Status**: Poll orchestration status until completion

## What Happens Next

The server automatically:
- Monitors source chain for deposit
- Deploys account + executes bridge on Base
- Monitors destination chain for funds
- Deploys account + executes AutoEarn on Arbitrum (invests in Aave)
- Updates status to `COMPLETED`

## API Reference

### Server-Side Module Builder API (Recommended)

- `buildAutoEarnModule(params, config?)` - Build AutoEarn module via server
- `buildAutoSwapModule(params, config?)` - Build AutoSwap module via server
- `buildAutoBridgeModule(params, config?)` - Build AutoBridge module via server
- `buildModulesBatch(modules, config?)` - Build multiple modules in one call
- `validateModule(module, config?)` - Validate a module configuration

### Client-Side Encoding (Manual)

- `getRequiredState()` - Get module requirements
- `createAutoEarnConfig()` - Create AutoEarn config object
- `encodeAutoEarnModuleData()` - Encode config for orchestration

### Orchestration Functions

- `createOrchestrationData()` - Create orchestration request
- `transferToOrchestrationAccount()` - Transfer tokens to orchestration account
- `notifyDeposit()` - Notify server of deposit
- `pollOrchestrationStatus()` - Monitor orchestration status

## Troubleshooting

- **Insufficient USDC**: Ensure your account has enough USDC on Base Sepolia
- **Server API not available**: The SDK automatically falls back to client-side encoding. This is expected if the server doesn't have the Module Builder API deployed yet.
- **Module not found**: Verify AutoEarn module address is correct for the chain. The SDK uses `getRequiredState()` to get the correct address.
- **Encoding errors**: If server API fails, check that you're providing the correct `vaultAddress` when using client-side encoding (it's optional with server API).

## Quick Test

To test the complete workflow:

```bash
# Set your private key in .env
TEST_PRIVATE_KEY=0xYourPrivateKeyHere

# Run the test
cd test
pnpm test:create-orchestration-data
```

The test will:
1. Try server API first
2. Fallback to client-side encoding if needed
3. Create orchestration
4. Transfer USDC
5. Notify server
6. Monitor status

