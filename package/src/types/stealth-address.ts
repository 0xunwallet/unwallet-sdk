export interface SafeAddress {
  address: string;
  isDeployed: boolean;
}

export interface EventListener {
  listenerId: string;
  isActive: boolean;
  startTime: string;
  timeRemaining: number;
  timeoutMinutes: number;
}

export interface StealthAddressData {
  address: string;
  chainId: number;
  chainName: string;
  tokenAddress: string;
  tokenAmount: string;
  paymentId: string;
  safeAddress: SafeAddress;
  eventListener: EventListener;
  usedNonce?: number;
  currentNonce?: number;
}

export interface StealthAddressResponse {
  success: boolean;
  timestamp: string;
  data: StealthAddressData;
  message: string;
}
