import { type WalletClient, type Address, type Hex, type PublicClient } from 'viem';

/**
 * EIP-3009 Transfer Authorization Types
 */
export interface TransferAuthorizationMessage {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

export interface TransferAuthorizationSignature {
  v: number;
  r: Hex;
  s: Hex;
}

export interface SignedTransferAuthorization extends TransferAuthorizationMessage {
  v: number;
  r: Hex;
  s: Hex;
}

/**
 * EIP-712 Domain for EIP-3009
 */
export interface EIP3009Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/**
 * EIP-3009 Type Hash
 */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/**
 * ERC20 ABI for token name
 */
const ERC20_NAME_ABI = [
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Generate a random nonce for EIP-3009 authorization
 */
export const generateNonce = (): Hex => {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return `0x${Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
};

/**
 * Get EIP-712 domain for a token
 */
export const getEIP3009Domain = async (
  tokenAddress: Address,
  chainId: number,
  publicClient: PublicClient,
  version: string = '2',
): Promise<EIP3009Domain> => {
  // Get token name from contract
  const tokenName = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_NAME_ABI,
    functionName: 'name',
  });

  return {
    name: tokenName as string,
    version,
    chainId,
    verifyingContract: tokenAddress,
  };
};

/**
 * Sign an EIP-3009 transferWithAuthorization message
 */
export const signTransferAuthorization = async (
  message: TransferAuthorizationMessage,
  domain: EIP3009Domain,
  walletClient: WalletClient,
): Promise<SignedTransferAuthorization> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have an account');
  }

  // Sign the typed data
  const signature = await walletClient.signTypedData({
    account: walletClient.account,
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: message.from,
      to: message.to,
      value: message.value,
      validAfter: message.validAfter,
      validBefore: message.validBefore,
      nonce: message.nonce,
    },
  });

  // Split signature into v, r, s
  const r = signature.slice(0, 66) as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    ...message,
    v,
    r,
    s,
  };
};

/**
 * Create a transfer authorization message with default validity window
 *
 * @param from - Address that owns the tokens
 * @param to - Address to transfer tokens to
 * @param value - Amount of tokens to transfer
 * @param validityWindow - Validity window in seconds (default: 1 hour)
 */
export const createTransferAuthorizationMessage = (
  from: Address,
  to: Address,
  value: bigint,
  validityWindow: number = 3600, // 1 hour default
): TransferAuthorizationMessage => {
  const now = Math.floor(Date.now() / 1000);

  return {
    from,
    to,
    value,
    validAfter: 0n, // Valid immediately
    validBefore: BigInt(now + validityWindow),
    nonce: generateNonce(),
  };
};

/**
 * Complete helper function to sign a transfer authorization
 *
 * @param from - Address that owns the tokens
 * @param to - Address to transfer tokens to
 * @param value - Amount of tokens to transfer
 * @param tokenAddress - Token contract address
 * @param chainId - Chain ID
 * @param walletClient - Wallet client to sign with
 * @param publicClient - Public client to read token info
 * @param validityWindow - Validity window in seconds (default: 1 hour)
 */
export const signTransferWithAuthorization = async (
  from: Address,
  to: Address,
  value: bigint,
  tokenAddress: Address,
  chainId: number,
  walletClient: WalletClient,
  publicClient: PublicClient,
  validityWindow: number = 3600,
): Promise<SignedTransferAuthorization> => {
  // Create message
  const message = createTransferAuthorizationMessage(from, to, value, validityWindow);

  // Get domain
  const domain = await getEIP3009Domain(tokenAddress, chainId, publicClient);

  // Sign
  return signTransferAuthorization(message, domain, walletClient);
};
