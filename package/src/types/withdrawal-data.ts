export interface BalanceData {
  address: string;
  balance: string;
  symbol: string;
  rawBalance: string;
  nonce: number;
  decimals: number;
  tokenAddress: string;
  transactionHash: string;
  stealthAddress: string;
  safeAddress: string;
  isFunded: boolean;
}

export interface FundedAddress {
  fromAddress?: string;
  safeAddress: string;
  tokenAddress: string;
  nonce: number;
  transactionHash: string;
  stealthAddress: string;
}

export interface FundingStatsResponse {
  data: {
    fundedAddresses: FundedAddress[];
  };
}

export interface TransactionResult {
  balanceData: BalanceData[];
  success: boolean;
  error?: string;
}
