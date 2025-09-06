import dotenv from "dotenv";
import { createStealthAddress } from "unwallet-sdk";

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

    if (result && typeof result === "object") {
      console.log("📊 Stealth address generated successfully");
      console.log("Address details:", {
        address: (result as any).address,
        safeAddress: (result as any).safeAddress,
        usedNonce: (result as any).usedNonce,
        currentNonce: (result as any).currentNonce,
      });
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCreateStealthAddress();
}
