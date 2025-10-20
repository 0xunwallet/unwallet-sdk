# Unwallet SDK

A TypeScript SDK for seamless crypto payments with stealth addresses and gasless transactions.

## Features

- **Stealth Address Generation** - Create private payment addresses
- **Gasless Payments** - Process transactions without gas fees
- **Transaction History** - Fetch payment data and balances
- **Multi-chain Support** - Works across supported blockchains

## Installation

```bash
npm install unwallet
```

## Quick Start

```typescript
import {
  createStealthAddress,
  getTransactions,
  processSinglePayment,
  checkPaymentStatus,
  pollPaymentStatus,
  getModules,
  type StealthAddressResponse,
  type PaymentStatus,
  type ModulesResponse
} from 'unwallet';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Create wallet and public clients
const account = privateKeyToAccount('0x...');
const walletClient = createWalletClient({
  account,
  chain: viemChain,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Generate stealth address
const stealthAddress: StealthAddressResponse = await createStealthAddress({
  username: 'your-username',
  chainId: 90..,
  tokenAddress: '0x...',
});

console.log('Payment ID:', stealthAddress.data.paymentId);
console.log('Stealth Address:', stealthAddress.data.address);

// Get transaction history
const transactions = await getTransactions({
  username: 'your-username',
  publicClient,
});

// Process payment
const payment = await processSinglePayment({
  walletClient,
  publicClient,
  chainId: 90..,
  tokenAddress: '0x...',
  requestedAmount: '1.0',
  recipientAddress: '0x...',
});

// Check payment status
const status: PaymentStatus = await checkPaymentStatus('payment-id');

// Poll payment status until completion
const finalStatus: PaymentStatus = await pollPaymentStatus('payment-id', {
  interval: 3000, // Poll every 3 seconds
  maxAttempts: 20, // Max 1 minute
  onStatusUpdate: (status) => console.log('Status:', status.data.status),
  onComplete: (status) => console.log('Payment completed!'),
});

// Get available modules
const modules: ModulesResponse = await getModules();
console.log('Available modules:', modules.modules.length);

modules.modules.forEach((module) => {
  console.log(`${module.name}: ${module.description}`);
  console.log('Required fields:', module.userInputs.requiredFields);
  console.log('Supported tokens:', module.userInputs.supportedTokens);
  console.log('Deployments:', module.deployments);
});
```

## API Reference

### `createStealthAddress(options)`

Generate a stealth address for private payments.

**Parameters:**

- `username` - Your username
- `chainId` - Chain ID (e.g., 84532 for Base Sepolia)
- `tokenAddress` - Token contract address (optional)

### `getTransactions(options)`

Fetch transaction history and balances.

**Parameters:**

- `username` - Your username
- `publicClient` - Viem public client instance

### `processSinglePayment(options)`

Process a single payment with gasless transaction.

**Parameters:**

- `walletClient` - Viem wallet client instance
- `publicClient` - Viem public client instance
- `chainId` - Chain ID
- `tokenAddress` - Token contract address
- `requestedAmount` - Amount to send
- `recipientAddress` - Recipient's address

### `checkPaymentStatus(paymentId)`

Check the current status of a payment.

**Parameters:**

- `paymentId` - The payment ID to check

### `pollPaymentStatus(paymentId, options)`

Poll payment status until completion or timeout.

**Parameters:**

- `paymentId` - The payment ID to poll
- `options` - Polling configuration:
  - `interval` - Polling interval in milliseconds (default: 2000)
  - `maxAttempts` - Maximum polling attempts (default: 30)
  - `onStatusUpdate` - Callback for status updates
  - `onComplete` - Callback when payment completes
  - `onError` - Callback for errors

### `getModules()`

Fetch all available smart contract modules that can be installed on user accounts.

**Returns:**

- `ModulesResponse` - Object containing:
  - `success` - Boolean indicating if the request was successful
  - `modules` - Array of available modules with their details including:
    - `id` - Unique module identifier
    - `name` - Human-readable module name
    - `description` - Module description
    - `userInputs` - Required fields and supported tokens for each network
    - `deployments` - Contract addresses for each supported network
  - `installationGuide` - Guide for formatting modules for registration

**Example:**

```typescript
const modules = await getModules();
console.log(`Found ${modules.modules.length} modules`);

modules.modules.forEach((module) => {
  console.log(`${module.name}: ${module.description}`);

  // Display required fields
  module.userInputs.requiredFields.forEach((field) => {
    console.log(`  Required: ${field.name} (${field.type}) - ${field.description}`);
  });

  // Display supported tokens by network
  Object.entries(module.userInputs.supportedTokens).forEach(([network, tokens]) => {
    console.log(`  ${network}: ${tokens.tokens.map((t) => t.symbol).join(', ')}`);
  });

  // Display deployments
  module.deployments.forEach((deployment) => {
    console.log(`  ${deployment.network}: ${deployment.address}`);
  });
});

// Access installation guide
console.log('Module format:', modules.installationGuide.moduleFormat.interface);
console.log('Example requests:', modules.installationGuide.exampleRequests);
```

## License

MIT
