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
  generateModulesForRegistration,
  getAvailableModules,
  validateModuleInputs,
  type StealthAddressResponse,
  type PaymentStatus,
  type ModulesResponse,
  type ModuleUserInput
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

// Generate modules for registration
const userModuleInputs: ModuleUserInput[] = [
  {
    moduleId: 'autoEarn',
    chainId: 421614,
    inputs: {
      chainId: 421614,
      tokenAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
    }
  }
];

const registrationModules = await generateModulesForRegistration(userModuleInputs);
console.log('Generated modules for registration:', registrationModules.modules);

// Use modules in account registration
const apiKeyResult = await getApiKey(accountConfig, {
  agentDetails: {
    email: 'user@example.com',
    website: 'https://example.com',
    description: 'My wallet',
    twitter: '@username',
    github: 'username',
    telegram: 'username',
    discord: 'username#1234',
  },
  moduleUserInputs: userModuleInputs, // Pass module inputs here
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

### `generateModulesForRegistration(userModuleInputs)`

Generates module JSON format for account registration from user-friendly inputs.

**Parameters:**

- `userModuleInputs` - Array of module user inputs:
  - `moduleId` - Module identifier (e.g., 'autoEarn', 'autoSwap')
  - `chainId` - Blockchain chain ID where the module is deployed
  - `inputs` - User inputs matching the module's required fields

**Returns:**

- `ModuleGenerationResult` - Object containing:
  - `modules` - Array of formatted modules ready for registration
  - `errors` - Array of any validation or generation errors

**Example:**

```typescript
const userModuleInputs: ModuleUserInput[] = [
  {
    moduleId: 'autoEarn',
    chainId: 421614,
    inputs: {
      chainId: 421614,
      tokenAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    },
  },
  {
    moduleId: 'autoSwap',
    chainId: 421614,
    inputs: {
      chainId: 421614,
      defaultTokenAddress: '0x4200000000000000000000000000000000000006',
    },
  },
];

const result = await generateModulesForRegistration(userModuleInputs);
console.log('Generated modules:', result.modules);
if (result.errors.length > 0) {
  console.log('Errors:', result.errors);
}
```

### `getAvailableModules()`

Gets a simplified list of available modules with their requirements.

**Returns:**

- `ModuleInfo[]` - Array of available modules with their details

### `validateModuleInputs(moduleId, userInputs)`

Validates user inputs against module requirements before generation.

**Parameters:**

- `moduleId` - Module identifier to validate against
- `userInputs` - User inputs to validate

**Returns:**

- `{valid: boolean, errors: string[]}` - Validation result with any errors

### `getApiKey(config, options)`

Creates an account and gets an API key for the Unwallet service. Now supports automatic module generation.

**Parameters:**

- `config` - Account configuration:
  - `walletClient` - Viem wallet client instance
  - `publicClient` - Viem public client instance
  - `chainId` - Chain ID
  - `ens` - ENS username
  - `modules` - Array of modules (can be empty if using moduleUserInputs)
  - `defaultToken` - Default token address
  - `needPrivacy` - Enable privacy features (optional)
  - `eigenAiEnabled` - Enable Eigen AI features (optional)
- `options` - Configuration options:
  - `agentDetails` - Agent information (email, website, description, social links)
  - `moduleUserInputs` - Array of module user inputs (optional)

**Returns:**

- Object containing:
  - `apiKey` - Generated API key
  - `ensCall` - ENS registration response
  - `signature` - Account configuration signature
  - `configHash` - Configuration hash

**Example with modules:**

```typescript
const result = await getApiKey(accountConfig, {
  agentDetails: {
    email: 'user@example.com',
    website: 'https://example.com',
    description: 'My wallet with AutoEarn',
    twitter: '@username',
    github: 'username',
    telegram: 'username',
    discord: 'username#1234',
  },
  moduleUserInputs: [
    {
      moduleId: 'autoEarn',
      chainId: 421614,
      inputs: {
        chainId: 421614,
        tokenAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      },
    },
  ],
});
```

## License

MIT
