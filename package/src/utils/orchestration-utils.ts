import { type Hex, type Address } from 'viem';
import { SERVER_URL_ENS } from './constants';

export enum TransferType {
  NORMAL = 0,
  TRANSFER_WITH_AUTHORIZATION = 1,
}

export interface SignedTransferAuthorizationData {
  from: Address;
  to: Address;
  value: string; // BigInt as string for JSON
  validAfter: string; // BigInt as string for JSON
  validBefore: string; // BigInt as string for JSON
  nonce: Hex;
  v: number;
  r: Hex;
  s: Hex;
}

export interface NotifyDepositParams {
  requestId: Hex;
  transactionHash: Hex;
  blockNumber: string | bigint;
  transferType?: TransferType;
  signedData?: SignedTransferAuthorizationData;
}

export interface NotifyDepositResponse {
  success: boolean;
  error?: string;
  message?: string;
}

export interface OrchestrationStatus {
  requestId: Hex;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  created_at?: string;
  updated_at?: string;
  error_message?: string;
  sourceChainId?: number;
  destinationChainId?: number;
}

export interface OrchestrationStatusResponse {
  success: boolean;
  error?: string;
  data?: OrchestrationStatus;
}

/**
 * Notify the server about a deposit to trigger orchestration
 */
export const notifyDeposit = async (
  params: NotifyDepositParams,
): Promise<NotifyDepositResponse> => {
  try {
    const payload: any = {
      requestId: params.requestId,
      transactionHash: params.transactionHash,
      blockNumber: typeof params.blockNumber === 'bigint'
        ? params.blockNumber.toString()
        : params.blockNumber,
    };

    // Add optional fields if present
    if (params.transferType !== undefined) {
      payload.transferType = params.transferType;
    }

    if (params.signedData) {
      payload.signedData = params.signedData;
    }

    console.log('Notifying server of deposit:', payload);

    const response = await fetch(`${SERVER_URL_ENS}/api/v1/notifications/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to notify server: ${response.status} - ${response.statusText}\n${errorText}`);
    }

    const result = (await response.json()) as NotifyDepositResponse;
    return result;
  } catch (error) {
    console.error('Error notifying deposit:', error);
    throw error;
  }
};

/**
 * Get the status of an orchestration request
 */
export const getOrchestrationStatus = async (
  requestId: Hex,
): Promise<OrchestrationStatus> => {
  try {
    console.log(`Checking orchestration status for requestId: ${requestId}`);

    const response = await fetch(`${SERVER_URL_ENS}/api/v1/orchestration/status/${requestId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get orchestration status: ${response.status} - ${response.statusText}\n${errorText}`);
    }

    const result = (await response.json()) as OrchestrationStatusResponse;

    if (!result.success || !result.data) {
      throw new Error(`Failed to get orchestration status: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  } catch (error) {
    console.error('Error getting orchestration status:', error);
    throw error;
  }
};

/**
 * Poll orchestration status until completion or failure
 */
export interface PollOrchestrationStatusOptions {
  requestId: Hex;
  interval?: number; // milliseconds between polls
  maxAttempts?: number; // maximum number of polls
  onStatusUpdate?: (status: OrchestrationStatus) => void;
  onComplete?: (status: OrchestrationStatus) => void;
  onError?: (error: Error) => void;
}

export const pollOrchestrationStatus = async (
  options: PollOrchestrationStatusOptions,
): Promise<OrchestrationStatus> => {
  const {
    requestId,
    interval = 3000,
    maxAttempts = 20,
    onStatusUpdate,
    onComplete,
    onError,
  } = options;

  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const status = await getOrchestrationStatus(requestId);

      if (onStatusUpdate) {
        onStatusUpdate(status);
      }

      if (status.status === 'COMPLETED') {
        if (onComplete) {
          onComplete(status);
        }
        return status;
      }

      if (status.status === 'FAILED') {
        const error = new Error(`Orchestration failed: ${status.error_message || 'Unknown error'}`);
        if (onError) {
          onError(error);
        }
        throw error;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Orchestration failed')) {
        throw error;
      }
      if (onError) {
        onError(error instanceof Error ? error : new Error('Unknown error'));
      }
      attempts++;
    }
  }

  throw new Error(`Orchestration status polling timed out after ${maxAttempts} attempts`);
};

/**
 * Helper function to notify deposit with EIP-3009 signed authorization
 */
export const notifyDepositGasless = async (
  requestId: Hex,
  transactionHash: Hex,
  blockNumber: string | bigint,
  signedAuthorization: {
    from: Address;
    to: Address;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: Hex;
    v: number;
    r: Hex;
    s: Hex;
  },
): Promise<NotifyDepositResponse> => {
  return notifyDeposit({
    requestId,
    transactionHash,
    blockNumber,
    transferType: TransferType.TRANSFER_WITH_AUTHORIZATION,
    signedData: {
      from: signedAuthorization.from,
      to: signedAuthorization.to,
      value: signedAuthorization.value.toString(),
      validAfter: signedAuthorization.validAfter.toString(),
      validBefore: signedAuthorization.validBefore.toString(),
      nonce: signedAuthorization.nonce,
      v: signedAuthorization.v,
      r: signedAuthorization.r,
      s: signedAuthorization.s,
    },
  });
};

