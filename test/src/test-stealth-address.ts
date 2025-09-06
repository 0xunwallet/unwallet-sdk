import dotenv from "dotenv";
import { createStealthAddress, pollPaymentStatus } from "unwallet-sdk";

// Load environment variables
dotenv.config();

// Test stealth address generation
export const testCreateStealthAddress = async () => {
  try {
    console.log("🔍 Testing createStealthAddress function...");

    const username = process.env.TEST_USERNAME || "kyskkysk";
    const tokenAddress = process.env.USDC_TOKEN_ADDRESS || "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

    console.log("📋 Test parameters:", {
      username,
      chainId: 84532, // Base Sepolia
      tokenAddress,
    });

    const result = await createStealthAddress({
      username,
      chainId: 84532, // Base Sepolia
      tokenAddress,
    });

    console.log("✅ Stealth address result:", result);

    if (result && result.success && result.data) {
      console.log("📊 Stealth address generated successfully");
      console.log("Address details:", {
        address: result.data.address,
        safeAddress: result.data.safeAddress,
        paymentId: result.data.paymentId,
        eventListener: result.data.eventListener,
        tokenAmount: result.data.tokenAmount,
        chainName: result.data.chainName,
      });

      // If we have a paymentId, start polling for payment status
      if (result.data.paymentId) {
        console.log("🔄 Starting payment status polling...");

        try {
          const paymentStatus = await pollPaymentStatus(result.data.paymentId, {
            interval: 3000, // Poll every 3 seconds
            maxAttempts: 100, // Max 1 minute of polling
            onStatusUpdate: (status) => {
              console.log("📊 Payment status update:", status.data?.status);
            },
            onComplete: (status) => {
              console.log("✅ Payment completed with status:", status.data?.status);
            },
            onError: (error) => {
              console.error("❌ Payment polling error:", error.message);
            },
          });

          console.log("🎉 Final payment status:", paymentStatus);
        } catch (error) {
          console.error("❌ Payment polling failed:", error);
        }
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCreateStealthAddress();
}
