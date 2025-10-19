import dotenv from "dotenv";
import { getTransactions } from "unwallet";
import { createPublicClient, http, type PublicClient } from "viem";
import { currentChain } from "./utils/chain.js";

// Load environment variables
dotenv.config();

// Test transaction fetching function
export const testGetTransactions = async () => {
  const publicClient = createPublicClient({
    chain: currentChain,
    transport: http(),
  });

  try {
    console.log("🔍 Testing getTransactions function...");

    const username = process.env.TEST_USERNAME || "kyskkysk";

    console.log("📋 Test parameters:", {
      username,
    });

    const result = await getTransactions({
      username,
      publicClient: publicClient as PublicClient,
    });

    console.log("✅ Transaction result:", result);

    if (result.success) {
      console.log(`📊 Found ${result.balanceData.length} transaction entries`);
      result.balanceData.forEach((entry, index) => {
        console.log(`Entry ${index + 1}:`, {
          address: entry.address,
          balance: entry.balance,
          symbol: entry.symbol,
          isFunded: entry.isFunded,
          stealthAddress: entry.stealthAddress,
          safeAddress: entry.safeAddress,
        });
      });
    } else {
      console.log("❌ Transaction fetch failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testGetTransactions();
}
