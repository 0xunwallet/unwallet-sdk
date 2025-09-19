export interface SinglePaymentResult {
  success: boolean;
  deploymentTransaction?: {
    to: string;
    data: string;
  };
  safeTransaction: {
    to: string;
    value: string;
    data: string;
    operation: number;
    safeTxGas: string;
    baseGas: string;
    gasPrice: string;
    gasToken: string;
    refundReceiver: string;
    nonce: number;
  };
  signature: string;
  txHash: string;
  gasUsed: string;
  gasCost: string;
  explorerUrl: string;
  sponsorDetails: {
    sponsorAddress: string;
  };
  summary: {
    stealthAddress: string;
    safeAddress: string;
    recipient: string;
    multicallCalls: number;
    executed: boolean;
    txHash: string;
    recipientBalance: string;
    sponsoredBy: string;
    gasUsed: string;
    explorerUrl: string;
  };
}

export interface TransferWithAuthorizationData {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface TransferWithAuthorizationResult {
  success: boolean;
  signature: string;
  authorization: TransferWithAuthorizationData;
  txHash?: string;
  gasUsed?: string;
  gasCost?: string;
  explorerUrl?: string;
  error?: string;
}
