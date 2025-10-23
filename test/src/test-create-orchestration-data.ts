import dotenv from "dotenv";
import { createOrchestrationData, getRequiredState } from "unwallet";
import { currentChain } from "./utils/chain.js";
import type { CurrentState } from "unwallet";

dotenv.config();

export const testCreateOrchestrationData = async () => {
  try {
    console.log("🔍 Testing createOrchestrationData function...");

    // Get required state first
    const requiredState = await getRequiredState(currentChain.id, "BOND");
    console.log("Required state:", requiredState);

    // Create current state
    const currentState: CurrentState = {
      chainId: currentChain.id,
      tokenAddress: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
      tokenAmount: "1.5",
      ownerAddress: "0x1234567890123456789012345678901234567890",
    };

    const ownerAddress = "0x9876543210987654321098765432109876543210";
    const apiKey = "test-api-key-12345";

    // Test the function
    const orchestrationData = await createOrchestrationData(currentState, requiredState, ownerAddress, apiKey);

    console.log("✅ Successfully created orchestration data:");
    console.log("Request ID:", orchestrationData.requestId);
    console.log("Source Chain ID:", orchestrationData.sourceChainId);
    console.log("Destination Chain ID:", orchestrationData.destinationChainId);
    console.log("Source Token Amount:", orchestrationData.sourceTokenAmount.toString());

    console.log("\n✅ Test completed successfully!");
    return orchestrationData;
  } catch (error) {
    console.error("❌ Error testing createOrchestrationData:", error);
    throw error;
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCreateOrchestrationData()
    .then(() => {
      console.log("\n✅ Test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}
