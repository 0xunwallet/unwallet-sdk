# Gasless USDC Transfer Guide

## Overview

The UnWallet SDK enables **truly gasless token transfers** using EIP-3009 `transferWithAuthorization`. This allows users to transfer USDC (or any EIP-3009-compatible token) without needing ETH for gas fees. The signing account can have **ZERO ETH** - all gas costs are paid by the server.

## Key Benefits

✅ **Truly Gasless** - Signing account needs ZERO ETH  
✅ **No Approvals** - No need for separate approval transactions  
✅ **Atomic Execution** - Transfer, deployment, and module execution in one transaction  
✅ **Server-Sponsored** - TEE server pays all gas costs  
✅ **Simple API** - Single function handles everything  

## How It Works

```
User Account (has USDC)
    ↓
    Sign EIP-3009 authorization (OFF-CHAIN - NO GAS!)
    ↓
    Send signed authorization to server
    ↓
Server
    ↓
    Execute Multicall3 batch (server pays gas):
    • transferWithAuthorization (move USDC from user to smart account)
    • Deploy smart account
    • Execute modules
```

## Prerequisites

1. **Install the SDK:**
   ```bash
   npm install unwallet
   # or
   pnpm add unwallet
   ```

2. **Required Dependencies:**
   ```bash
   npm install viem
   ```

3. **Supported Tokens:**
   - USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - USDC on Arbitrum Sepolia: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`
   - Any token implementing EIP-3009 `transferWithAuthorization`

## Quick Start

### Basic Example

```typescript
import {
  createOrchestrationData,
  depositGasless,
  notifyDepositGasless,
  pollOrchestrationStatus,
  getRequiredState,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from 'unwallet';
import type { CurrentState, OrchestrationStatus, GaslessDepositResult } from 'unwallet';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia } from 'viem/chains';
import type { Address, Hex } from 'viem';

// 1. Setup accounts and clients
const userPrivateKey = '0x...'; // Your account with USDC
const userAccount = privateKeyToAccount(userPrivateKey as Hex);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

const userWalletClient = createWalletClient({
  account: userAccount,
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
});

// 2. Create orchestration request
const currentState: CurrentState = {
  chainId: baseSepolia.id,
  tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC
  tokenAmount: parseUnits('0.1', 6).toString(), // 0.1 USDC
  ownerAddress: userAccount.address, // User account owns smart accounts
};

const requiredState = await getRequiredState({
  sourceChainId: arbitrumSepolia.id,
  moduleName: 'AUTOEARN',
});

const autoEarnConfig = createAutoEarnConfig(
  421614, // Arbitrum Sepolia
  '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', // USDC on Arbitrum
  '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff' // Aave Pool
);
const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);

const orchestrationData = await createOrchestrationData(
  currentState,
  requiredState,
  userAccount.address,
  'your-api-key',
  encodedData as Hex
);

// 3. Sign EIP-3009 authorization (OFF-CHAIN - NO GAS!)
const gaslessResult: GaslessDepositResult = await depositGasless(
  userAccount.address, // From - user's wallet that owns USDC
  orchestrationData.accountAddressOnSourceChain, // To - smart account
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC address
  parseUnits('0.1', 6), // Amount
  userWalletClient, // Wallet client (signs authorization, NO ETH needed for signing!)
  publicClient
);

if (!gaslessResult.success || !gaslessResult.signedAuthorization) {
  throw new Error(`Gasless deposit failed: ${gaslessResult.error}`);
}

// 4. Notify server with signed authorization
// Note: No transaction hash needed - signing was off-chain!
await notifyDepositGasless(
  orchestrationData.requestId,
  '0x' as Hex, // Placeholder - no transaction hash for off-chain signing
  '0', // Placeholder - no block number for off-chain signing
  gaslessResult.signedAuthorization
);

// 5. Monitor orchestration status
await pollOrchestrationStatus({
  requestId: orchestrationData.requestId,
  interval: 3000,
  maxAttempts: 60,
  onStatusUpdate: (status: OrchestrationStatus) => {
    console.log(`Status: ${status.status}`);
  },
  onComplete: (status: OrchestrationStatus) => {
    console.log('✅ Orchestration completed!');
  },
  onError: (error: Error) => {
    console.error('❌ Error:', error.message);
  },
});
```

## Step-by-Step Guide

### Step 1: Setup Account

You only need one account:

1. **User Account** - Has USDC (NO ETH needed for signing!)

```typescript
import { privateKeyToAccount } from 'viem/accounts';

// User account (has USDC, NO ETH needed for signing!)
const userAccount = privateKeyToAccount('0xYourPrivateKey' as Hex);

console.log('User account:', userAccount.address);
```

### Step 2: Create Orchestration Request

Create an orchestration request to get the smart account addresses:

```typescript
import {
  createOrchestrationData,
  getRequiredState,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from 'unwallet';
import type { CurrentState } from 'unwallet';

const currentState: CurrentState = {
  chainId: 84532, // Base Sepolia
  tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC
  tokenAmount: parseUnits('0.1', 6).toString(), // 0.1 USDC (6 decimals)
  ownerAddress: userAccount.address, // User account owns smart accounts
};

const requiredState = await getRequiredState({
  sourceChainId: 421614, // Arbitrum Sepolia
  moduleName: 'AUTOEARN',
});

// Encode module configuration
const autoEarnConfig = createAutoEarnConfig(
  421614,
  '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', // USDC on Arbitrum
  '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff' // Aave Pool
);
const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);

const orchestrationData = await createOrchestrationData(
  currentState,
  requiredState,
  userAccount.address,
  'your-api-key',
  encodedData as Hex
);

console.log('Request ID:', orchestrationData.requestId);
console.log('Source Account:', orchestrationData.accountAddressOnSourceChain);
console.log('Destination Account:', orchestrationData.accountAddressOnDestinationChain);
```

### Step 3: Sign EIP-3009 Authorization

The `depositGasless` function signs the EIP-3009 authorization off-chain (NO GAS!):

```typescript
import { depositGasless } from 'unwallet';
import type { GaslessDepositResult } from 'unwallet';

const gaslessResult: GaslessDepositResult = await depositGasless(
  userAccount.address, // From - user's wallet that owns USDC
  orchestrationData.accountAddressOnSourceChain, // To - smart account address
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC token address
  parseUnits('0.1', 6), // Amount (0.1 USDC)
  userWalletClient, // Wallet client (signs authorization, NO ETH needed!)
  publicClient
);

if (!gaslessResult.success || !gaslessResult.signedAuthorization) {
  throw new Error(`Gasless deposit failed: ${gaslessResult.error}`);
}

console.log('✅ Authorization signed (off-chain, no gas!)');
console.log('Authorization:', gaslessResult.signedAuthorization);
```

### Step 4: Notify Server

Send the signed authorization to the server:

```typescript
import { notifyDepositGasless } from 'unwallet';

// Note: No transaction hash needed - signing was off-chain!
await notifyDepositGasless(
  orchestrationData.requestId,
  '0x' as Hex, // Placeholder - no transaction hash for off-chain signing
  '0', // Placeholder - no block number for off-chain signing
  gaslessResult.signedAuthorization
);

console.log('✅ Server notified! Server will execute transferWithAuthorization');
```

### Step 5: Monitor Status

Poll the orchestration status until completion:

```typescript
import { pollOrchestrationStatus } from 'unwallet';
import type { OrchestrationStatus } from 'unwallet';

await pollOrchestrationStatus({
  requestId: orchestrationData.requestId,
  interval: 3000, // Poll every 3 seconds
  maxAttempts: 60, // Max 3 minutes
  onStatusUpdate: (status: OrchestrationStatus) => {
    console.log(`Status: ${status.status}`);
    if (status.error_message) {
      console.log(`Error: ${status.error_message}`);
    }
  },
  onComplete: (status: OrchestrationStatus) => {
    console.log('🎉 Orchestration completed successfully!');
    console.log(`Final status: ${status.status}`);
  },
  onError: (error: Error) => {
    console.error('❌ Orchestration failed:', error.message);
  },
});
```

## API Reference

### `depositGasless()`

Execute a gasless deposit with EIP-3009 authorization.

**Parameters:**
- `fromAddress: Address` - User's wallet address that owns the tokens
- `smartAccountAddress: Address` - Smart account address (from orchestration)
- `tokenAddress: Address` - Token address (e.g., USDC, must support EIP-3009)
- `tokenAmount: bigint` - Amount to transfer (in smallest unit, e.g., 6 decimals for USDC)
- `walletClient: WalletClient` - Wallet client (signs authorization, NO ETH needed for signing!)
- `publicClient: PublicClient` - Public client for blockchain reads
- `validityWindow?: number` - Validity window in seconds (default: 3600 = 1 hour)

**Returns:**
```typescript
Promise<GaslessDepositResult>

interface GaslessDepositResult {
  success: boolean;
  signedAuthorization?: SignedTransferAuthorization;
  error?: string;
}
```

### `notifyDepositGasless()`

Notify the server with a signed EIP-3009 authorization.

**Parameters:**
- `requestId: Hex` - Orchestration request ID
- `transactionHash: Hex` - Placeholder (use `'0x'` for off-chain signing)
- `blockNumber: string | bigint` - Placeholder (use `'0'` for off-chain signing)
- `signedAuthorization: SignedTransferAuthorization` - Signed authorization from `depositGasless()`

**Returns:**
```typescript
Promise<NotifyDepositResponse>
```

**Note:** For gasless transfers, `transactionHash` and `blockNumber` are placeholders since signing happens off-chain. The server will execute the `transferWithAuthorization` on-chain.

### `pollOrchestrationStatus()`

Poll orchestration status until completion or failure.

**Parameters:**
```typescript
{
  requestId: Hex;
  interval?: number; // Polling interval in ms (default: 3000)
  maxAttempts?: number; // Max polling attempts (default: 20)
  onStatusUpdate?: (status: OrchestrationStatus) => void;
  onComplete?: (status: OrchestrationStatus) => void;
  onError?: (error: Error) => void;
}
```

## Complete Example

Here's a complete example for a wallet integration:

```typescript
import {
  createOrchestrationData,
  depositGasless,
  notifyDepositGasless,
  pollOrchestrationStatus,
  getRequiredState,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from 'unwallet';
import type { CurrentState, GaslessDepositResult } from 'unwallet';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia } from 'viem/chains';
import type { Address, Hex } from 'viem';

async function executeGaslessTransfer(
  userPrivateKey: Hex,
  amount: string, // e.g., "0.1"
  apiKey: string
) {
  // Setup
  const userAccount = privateKeyToAccount(userPrivateKey);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  const userWalletClient = createWalletClient({
    account: userAccount,
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  // 1. Create orchestration
  const currentState: CurrentState = {
    chainId: baseSepolia.id,
    tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenAmount: parseUnits(amount, 6).toString(),
    ownerAddress: userAccount.address,
  };

  const requiredState = await getRequiredState({
    sourceChainId: arbitrumSepolia.id,
    moduleName: 'AUTOEARN',
  });

  const autoEarnConfig = createAutoEarnConfig(
    421614,
    '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
    '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff'
  );
  const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);

  const orchestrationData = await createOrchestrationData(
    currentState,
    requiredState,
    userAccount.address,
    apiKey,
    encodedData as Hex
  );

  // 2. Sign EIP-3009 authorization (off-chain, no gas!)
  const gaslessResult: GaslessDepositResult = await depositGasless(
    userAccount.address,
    orchestrationData.accountAddressOnSourceChain,
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    parseUnits(amount, 6),
    userWalletClient,
    publicClient
  );

  if (!gaslessResult.success || !gaslessResult.signedAuthorization) {
    throw new Error(`Gasless deposit failed: ${gaslessResult.error}`);
  }

  // 3. Notify server
  await notifyDepositGasless(
    orchestrationData.requestId,
    '0x' as Hex, // Placeholder - no transaction hash for off-chain signing
    '0', // Placeholder - no block number for off-chain signing
    gaslessResult.signedAuthorization
  );

  // 4. Monitor status
  await pollOrchestrationStatus({
    requestId: orchestrationData.requestId,
    interval: 3000,
    maxAttempts: 60,
    onStatusUpdate: (status) => console.log(`Status: ${status.status}`),
    onComplete: (status) => console.log('✅ Complete!'),
    onError: (error) => console.error('❌ Error:', error.message),
  });

  return {
    requestId: orchestrationData.requestId,
    sourceAccount: orchestrationData.accountAddressOnSourceChain,
    destinationAccount: orchestrationData.accountAddressOnDestinationChain,
  };
}

// Usage
const result = await executeGaslessTransfer(
  '0xYourPrivateKey' as Hex,
  '0.1', // 0.1 USDC
  'your-api-key'
);
```

## Architecture

### Flow Diagram

```
┌─────────────┐
│ User Wallet │ (has USDC)
└──────┬──────┘
       │
       │ 1. Sign EIP-3009 authorization
       │    (OFF-CHAIN - NO GAS!)
       ▼
┌─────────────┐
│   Server    │
└──────┬──────┘
       │
       │ 2. Execute Multicall3 batch:
       │    - transferWithAuthorization (move USDC from user to smart account)
       │    - Deploy smart account
       │    - Execute modules
       │    (Server pays all gas!)
       ▼
┌─────────────┐
│  Blockchain │
└─────────────┘
```

## Security Considerations

1. **Nonce Uniqueness**: Each authorization uses a unique nonce (automatically generated)
2. **Validity Window**: Authorizations expire after 1 hour (configurable)
3. **Signature Verification**: Server verifies signatures on-chain before executing
4. **Token Ownership**: Ensure user account owns tokens before signing
5. **Amount Verification**: Verify amount matches orchestration amount

## Supported Tokens

Currently tested with:
- **USDC on Base Sepolia**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **USDC on Arbitrum Sepolia**: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`

To check if a token supports EIP-3009:

```typescript
try {
  const typehash = await publicClient.readContract({
    address: tokenAddress,
    abi: [{
      inputs: [],
      name: 'TRANSFER_WITH_AUTHORIZATION_TYPEHASH',
      outputs: [{ name: '', type: 'bytes32' }],
      stateMutability: 'view',
      type: 'function',
    }],
    functionName: 'TRANSFER_WITH_AUTHORIZATION_TYPEHASH',
  });
  console.log('✅ Token supports EIP-3009');
} catch {
  console.log('❌ Token does not support EIP-3009');
}
```

## Troubleshooting

### "Insufficient USDC"
- Ensure user account has enough USDC on the source chain
- Check token decimals (USDC uses 6 decimals)

### "Gasless deposit failed"
- Verify user account has sufficient USDC balance
- Check that token supports EIP-3009
- Ensure network RPC is accessible
- Verify the wallet client is properly configured

### "Server not responding"
- Check API server URL is correct
- Verify API key is valid
- Check network connectivity

### "Orchestration failed"
- Check orchestration status for error messages
- Verify module configuration is correct
- Ensure destination chain is accessible

## Best Practices

1. **Error Handling**: Always check `gaslessResult.success` before proceeding
2. **Status Polling**: Use appropriate polling intervals (3-5 seconds) to avoid rate limiting
3. **User Feedback**: Show status updates to users during orchestration
4. **Retry Logic**: Implement retry logic for network failures
5. **Validity Window**: Consider adjusting the validity window based on your use case (default is 1 hour)

## Differences from Normal Transfer

| Feature | Normal Transfer | Gasless Transfer |
|---------|----------------|------------------|
| Gas Required | User pays gas | Server pays gas |
| Account Needs ETH | Yes | No (user account needs ZERO ETH for signing!) |
| Approvals | May require approval | No approval needed |
| Execution | Separate transaction | Included in Multicall3 batch |
| Atomicity | Separate steps | All in one transaction |
| Signing | On-chain (requires gas) | Off-chain (no gas needed!) |

## Testing

To test the gasless transfer functionality:

```bash
cd test
pnpm test:gasless-deposit-eip3009
```

Make sure your `test/.env` has:
```bash
TEST_PRIVATE_KEY=0xYourPrivateKeyWithUSDC
```

## Summary

The gasless transfer feature enables truly gasless token transfers by:

1. ✅ **Off-chain signing** - Users sign EIP-3009 authorizations without paying gas (NO ETH needed!)
2. ✅ **Server-side execution** - Server executes `transferWithAuthorization` in Multicall3 batches
3. ✅ **Atomic operations** - Transfer, deployment, and module execution in a single transaction
4. ✅ **Zero ETH requirement** - User wallet needs ZERO ETH for signing (only needs USDC)

This provides a seamless, gasless experience for users while maintaining security through on-chain signature verification. The user simply signs an authorization off-chain, and the server handles all on-chain execution.

