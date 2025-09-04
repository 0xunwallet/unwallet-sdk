export interface RedemptionResultSummary {
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
}

export interface RedemptionResult {
  success: boolean;
  // Using unknown for SDK-specific complex objects to avoid leaking external types
  deploymentTransaction?: unknown;
  safeTransaction?: unknown;
  signature?: string;
  txHash?: string;
  gasUsed?: string;
  gasCost?: string;
  explorerUrl?: string;
  sponsorDetails?: {
    sponsorAddress: string;
    chainName?: string;
  };
  summary: RedemptionResultSummary;
}
