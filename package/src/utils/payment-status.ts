import axios from 'axios';
import { BACKEND_URL } from './constants';

export interface PaymentStatusData {
  paymentId: string;
  stealthAddress: string;
  status: 'listening' | 'completed' | 'failed' | 'expired';
  chainId: number;
  tokenAddress: string;
  tokenAmount: string;
  isActive: boolean;
  expiresAt: string;
  completedAt: string | null;
  transactionHash: string | null;
  fromAddress: string | null;
  actualAmount: string | null;
  createdAt: string;
  eventListener?: {
    listenerId: string;
    isActive: boolean;
    startTime: string;
    timeRemaining: number;
    timeoutMinutes: number;
  };
}

export interface PaymentStatus {
  success: boolean;
  timestamp: string;
  data: PaymentStatusData;
  message: string;
}

export interface PollingOptions {
  interval?: number; // milliseconds, default 2000
  maxAttempts?: number; // default 30 (1 minute with 2s interval)
  onStatusUpdate?: (status: PaymentStatus) => void;
  onComplete?: (status: PaymentStatus) => void;
  onError?: (error: Error) => void;
}

export const checkPaymentStatus = async (paymentId: string): Promise<PaymentStatus> => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/user/payment/${paymentId}/status`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = response.data;
    console.log('📊 Payment Status:', data);

    if (data.success && data.data) {
      return data as PaymentStatus;
    } else {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        data: {} as PaymentStatusData,
        message: data.message || 'Failed to fetch payment status',
      };
    }
  } catch (error) {
    console.error('❌ Error checking payment status:', error);
    return {
      success: false,
      timestamp: new Date().toISOString(),
      data: {} as PaymentStatusData,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

export const pollPaymentStatus = async (
  paymentId: string,
  options: PollingOptions = {},
): Promise<PaymentStatus> => {
  const { interval = 2000, maxAttempts = 30, onStatusUpdate, onComplete, onError } = options;

  let attempts = 0;
  let pollingInterval: NodeJS.Timeout | null = null;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      attempts++;
      console.log(`🔄 Polling attempt ${attempts}/${maxAttempts} for payment ${paymentId}`);

      try {
        const status = await checkPaymentStatus(paymentId);

        // Call status update callback
        if (onStatusUpdate) {
          onStatusUpdate(status);
        }

        // Check if payment is completed, failed, or expired
        if (status.success && status.data) {
          const paymentStatus = status.data.status;

          if (
            paymentStatus === 'completed' ||
            paymentStatus === 'failed' ||
            paymentStatus === 'expired'
          ) {
            console.log(`🛑 Payment ${paymentId} status: ${paymentStatus}`);

            // Clear interval
            if (pollingInterval) {
              clearInterval(pollingInterval);
            }

            // Call completion callback
            if (onComplete) {
              onComplete(status);
            }

            resolve(status);
            return;
          }
        }

        // Check if we've exceeded max attempts
        if (attempts >= maxAttempts) {
          console.log(`⏰ Polling timeout reached for payment ${paymentId}`);

          if (pollingInterval) {
            clearInterval(pollingInterval);
          }

          const timeoutError = new Error(
            `Payment status polling timeout after ${maxAttempts} attempts`,
          );
          if (onError) {
            onError(timeoutError);
          }
          reject(timeoutError);
          return;
        }
      } catch (error) {
        console.error(`❌ Error during polling attempt ${attempts}:`, error);

        if (onError) {
          onError(error instanceof Error ? error : new Error('Unknown polling error'));
        }

        // Continue polling unless we've exceeded max attempts
        if (attempts >= maxAttempts) {
          if (pollingInterval) {
            clearInterval(pollingInterval);
          }
          reject(error);
        }
      }
    };

    // Start polling
    poll(); // Initial call
    pollingInterval = setInterval(poll, interval);
  });
};
