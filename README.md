# unwallet

TypeScript SDK for Unwallet.

## Installation

```bash
pnpm add unwallet
```

## Usage

```ts
import { createStealthAddress, processOnePayment } from 'unwallet';

// Create a stealth address for a username on a supported chain
const address = await createStealthAddress({
  username: 'alice',
  chainId: 84532, // example: Base Sepolia
  tokenAddress: '0x0000000000000000000000000000000000000000',
});

// Process a single payment with sponsorship
const result = await processOnePayment({
  walletClient, // viem WalletClient
  publicClient, // viem PublicClient
  chainId: 84532,
  username: 'alice',
  tokenAddress: '0x0000000000000000000000000000000000000000',
  amount: '1',
  decimals: 18,
  token: 'ETH',
  nonce: 1,
  recipientAddress: '0xrecipient...',
});
```

## Repository

GitHub: [`0xunwallet/unwallet-sdk`](https://github.com/0xunwallet/unwallet-sdk)

## License

MIT
