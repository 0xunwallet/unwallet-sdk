# AutoEarn: Base to Arbitrum USDC Bridge

This guide shows how to use the Unwallet SDK to bridge USDC from Base Sepolia to Arbitrum Sepolia and automatically invest it in Aave using the AutoEarn module.

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

## Complete Example

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
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
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

  // 2. Get required state for AutoEarn module
  const requiredState = await getRequiredState({
    sourceChainId: arbitrumSepolia.id,
    moduleName: 'AUTOEARN',
  });

  // 3. Create and encode AutoEarn configuration
  const autoEarnConfig = createAutoEarnConfig(
    421614, // Arbitrum Sepolia chain ID
    NETWORKS.arbitrumSepolia.usdcToken,
    NETWORKS.arbitrumSepolia.aavePool,
  );
  const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);

  // 4. Create orchestration request
  const bridgeAmount = parseUnits('0.1', 6); // 0.1 USDC
  const orchestrationData = await createOrchestrationData(
    {
      chainId: baseSepolia.id,
      tokenAddress: NETWORKS.baseSepolia.usdcToken,
      tokenAmount: bridgeAmount.toString(),
      ownerAddress: fundingAccount.address,
    },
    requiredState,
    fundingAccount.address,
    process.env.API_KEY || 'test-api-orchestration',
    encodedData,
  );

  console.log(`✅ Orchestration created: ${orchestrationData.requestId}`);
  console.log(`📍 Source Account: ${orchestrationData.accountAddressOnSourceChain}`);
  console.log(`📍 Destination Account: ${orchestrationData.accountAddressOnDestinationChain}`);

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

## Workflow Steps

1. **Get Required State**: Fetch AutoEarn module requirements for Arbitrum Sepolia
2. **Encode Module Data**: Create AutoEarn config (chain, token, vault) and encode it
3. **Create Orchestration**: Send request to server to create orchestration
4. **Transfer Tokens**: Transfer USDC to the computed source account address
5. **Notify Server**: Tell the server about the deposit
6. **Monitor Status**: Poll orchestration status until completion

## What Happens Next

The server automatically:
- Monitors source chain for deposit
- Deploys account + executes bridge on Base
- Monitors destination chain for funds
- Deploys account + executes AutoEarn on Arbitrum (invests in Aave)
- Updates status to `COMPLETED`

## API Reference

- `getRequiredState()` - Get module requirements
- `createAutoEarnConfig()` - Create AutoEarn config object
- `encodeAutoEarnModuleData()` - Encode config for orchestration
- `createOrchestrationData()` - Create orchestration request
- `transferToOrchestrationAccount()` - Transfer tokens to orchestration account
- `notifyDeposit()` - Notify server of deposit
- `pollOrchestrationStatus()` - Monitor orchestration status

## Troubleshooting

- **Insufficient USDC**: Ensure your account has enough USDC on Base Sepolia
- **Server not responding**: Check `TEST_SERVER_URL` or start local server
- **Module not found**: Verify AutoEarn module address is correct for the chain

